#!/usr/bin/env python3
"""Train and evaluate leakage-aware flight delay models from a BTS-style CSV.

The regression target is arrival delay in minutes. The classification target is
whether arrival delay is greater than 15 minutes. Only information normally
available before departure is used as a feature.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyRegressor, DummyClassifier
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor, ExtraTreesRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    mean_absolute_error, mean_squared_error, r2_score,
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, average_precision_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder


ALIASES = {
    "flight_date": ["fl_date", "flight_date", "date"],
    "arrival_delay": ["arr_delay", "arrival_delay", "arrival_delay_minutes"],
    "departure_delay": ["dep_delay", "departure_delay"],
    "delay_15": ["arr_del15", "arrival_delayed_15", "is_delayed"],
    "carrier": ["op_unique_carrier", "op_carrier", "carrier", "airline"],
    "origin": ["origin", "origin_airport", "origin_airport_code"],
    "destination": ["dest", "destination", "dest_airport", "destination_airport_code"],
    "scheduled_departure": ["crs_dep_time", "scheduled_departure", "scheduled_departure_time"],
    "distance": ["distance", "distance_miles", "flight_distance"],
    "congestion": ["congestion_index", "relative_congestion", "airport_congestion"],
    "cancelled": ["cancelled", "canceled", "cancelled_flag", "cancelled_flight"],
}


def norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(name).strip().lower()).strip("_")


def find_column(frame: pd.DataFrame, aliases: list[str]) -> str | None:
    lookup = {norm(c): c for c in frame.columns}
    for alias in aliases:
        if norm(alias) in lookup:
            return lookup[norm(alias)]
    return None


def prepare_data(frame: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series, pd.Series, pd.Series | None, list[str], list[str]]:
    """Return features, continuous target, binary target, dates, and feature types."""
    date_col = find_column(frame, ALIASES["flight_date"])
    delay_col = find_column(frame, ALIASES["arrival_delay"])
    if delay_col is None:
        raise ValueError(
            "Could not find an arrival-delay target. Expected a column such as "
            "'arr_delay' (minutes). Departure delay is not silently substituted."
        )

    work = frame.copy()
    dates = pd.to_datetime(work[date_col], errors="coerce") if date_col else None
    delay = pd.to_numeric(work[delay_col], errors="coerce")
    valid = delay.notna() & np.isfinite(delay)
    cancelled_col = find_column(work, ALIASES["cancelled"])
    if cancelled_col:
        cancelled = pd.to_numeric(work[cancelled_col], errors="coerce").fillna(0)
        # BTS cancelled rows are not valid arrival-delay training examples.
        valid &= cancelled.eq(0)

    work = work.loc[valid].copy()
    delay = delay.loc[valid].astype(float).clip(-180, 1200)
    dates = dates.loc[valid] if dates is not None else None

    features = pd.DataFrame(index=work.index)
    if dates is not None:
        features["month"] = dates.dt.month
        features["day_of_month"] = dates.dt.day
        features["day_of_week"] = dates.dt.dayofweek
        features["is_weekend"] = (dates.dt.dayofweek >= 5).astype(int)
        features["flight_date"] = dates

    # Calendar fields can be used if the source does not include a parseable date.
    for feature, aliases in {
        "year": ["year"], "month": ["month"],
        "day_of_month": ["day_of_month", "day"],
        "day_of_week": ["day_of_week", "day_of_week_num"],
    }.items():
        col = find_column(work, aliases)
        if col and feature not in features:
            features[feature] = pd.to_numeric(work[col], errors="coerce")

    for feature, key in [
        ("carrier", "carrier"), ("origin", "origin"), ("destination", "destination")
    ]:
        col = find_column(work, ALIASES[key])
        if col:
            features[feature] = work[col].astype("string").fillna("UNKNOWN").astype(str)

    dep_col = find_column(work, ALIASES["scheduled_departure"])
    if dep_col:
        # HHMM integer/string -> hour and minute; malformed values become missing.
        raw = pd.to_numeric(work[dep_col], errors="coerce")
        features["scheduled_departure_hour"] = (raw // 100).where(raw.between(0, 2359))
        features["scheduled_departure_minute"] = (raw % 100).where(raw.between(0, 2359))

    for feature, key in [("distance", "distance"), ("congestion", "congestion")]:
        col = find_column(work, ALIASES[key])
        if col:
            features[feature] = pd.to_numeric(work[col], errors="coerce")

    # Remove target-derived or operational-after-the-fact fields by construction.
    # Only the explicit pre-departure features above are allowed.
    if "flight_date" in features:
        features = features.drop(columns=["flight_date"])
    if features.empty:
        raise ValueError("No usable pre-departure feature columns were found in the CSV.")

    delay15_col = find_column(work, ALIASES["delay_15"])
    if delay15_col:
        raw_y = pd.to_numeric(work.loc[features.index, delay15_col], errors="coerce")
        # BTS arr_del15 is 0/1; tolerate textual booleans as a fallback.
        binary = raw_y.where(raw_y.isin([0, 1]))
    else:
        binary = pd.Series(np.nan, index=features.index)
    binary = binary.fillna((delay.loc[features.index] > 15).astype(int)).astype(int)

    numeric = [c for c in features.columns if pd.api.types.is_numeric_dtype(features[c])]
    categorical = [c for c in features.columns if c not in numeric]
    return features, delay.loc[features.index], binary.loc[features.index], dates, numeric, categorical


def make_pipeline(model, numeric: list[str], categorical: list[str]) -> Pipeline:
    transformers = []
    if numeric:
        transformers.append(("numeric", Pipeline([
            ("imputer", SimpleImputer(strategy="median", add_indicator=True)),
        ]), numeric))
    if categorical:
        transformers.append(("categorical", Pipeline([
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore")),
        ]), categorical))
    preprocess = ColumnTransformer(transformers=transformers, remainder="drop")
    return Pipeline([("preprocess", preprocess), ("model", model)])


def split_indices(features: pd.DataFrame, dates: pd.Series | None, test_size: float, seed: int):
    if dates is not None and dates.notna().sum() >= max(10, int(len(features) * 0.8)):
        # Chronological holdout prevents future flights leaking into training.
        order = np.argsort(dates.loc[features.index].values)
        cut = max(1, min(len(order) - 1, int(len(order) * (1 - test_size))))
        return features.index[order[:cut]], features.index[order[cut:]], "chronological"
    train, test = train_test_split(features.index, test_size=test_size, random_state=seed)
    print("WARNING: No sufficiently complete flight date found; using a random holdout.")
    return train, test, "random"


def regression_metrics(y_true, y_pred) -> dict:
    return {
        "mae_minutes": round(float(mean_absolute_error(y_true, y_pred)), 4),
        "rmse_minutes": round(float(math.sqrt(mean_squared_error(y_true, y_pred))), 4),
        "r2": round(float(r2_score(y_true, y_pred)), 4) if len(y_true) > 1 else None,
    }


def classification_metrics(y_true, y_pred, probabilities) -> dict:
    result = {
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "precision_delayed": round(float(precision_score(y_true, y_pred, zero_division=0)), 4),
        "recall_delayed": round(float(recall_score(y_true, y_pred, zero_division=0)), 4),
        "f1_delayed": round(float(f1_score(y_true, y_pred, zero_division=0)), 4),
    }
    if len(np.unique(y_true)) > 1:
        result["roc_auc"] = round(float(roc_auc_score(y_true, probabilities)), 4)
        result["average_precision"] = round(float(average_precision_score(y_true, probabilities)), 4)
    else:
        result["roc_auc"] = None
        result["average_precision"] = None
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", required=True, help="Path to historical BTS-style CSV")
    parser.add_argument("--output-dir", default="ml/artifacts", help="Model and metrics output directory")
    parser.add_argument("--test-size", type=float, default=0.2, help="Holdout fraction (default: 0.2)")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    data_path = Path(args.data)
    if not data_path.exists():
        parser.error(f"Dataset not found: {data_path}")
    if not 0.1 <= args.test_size <= 0.4:
        parser.error("--test-size must be between 0.1 and 0.4")

    raw = pd.read_csv(data_path, low_memory=False)
    X, y_reg, y_cls, dates, numeric, categorical = prepare_data(raw)
    if len(X) < 30:
        raise SystemExit(f"Need at least 30 valid flight records; found {len(X)}.")
    train_idx, test_idx, split_type = split_indices(X, dates, args.test_size, args.seed)
    X_train, X_test = X.loc[train_idx], X.loc[test_idx]
    yr_train, yr_test = y_reg.loc[train_idx], y_reg.loc[test_idx]
    yc_train, yc_test = y_cls.loc[train_idx], y_cls.loc[test_idx]

    regressor = make_pipeline(
        RandomForestRegressor(n_estimators=350, min_samples_leaf=2, max_features=0.85,
                              random_state=args.seed, n_jobs=-1),
        numeric, categorical,
    )
    classifier = make_pipeline(
        RandomForestClassifier(n_estimators=350, min_samples_leaf=2, class_weight="balanced",
                               random_state=args.seed, n_jobs=-1),
        numeric, categorical,
    )
    regressor.fit(X_train, yr_train)
    classifier.fit(X_train, yc_train)

    reg_pred = regressor.predict(X_test)
    cls_prob = classifier.predict_proba(X_test)[:, list(classifier.named_steps["model"].classes_).index(1)]
    cls_pred = (cls_prob >= 0.5).astype(int)

    baseline_reg = DummyRegressor(strategy="median").fit(X_train, yr_train)
    baseline_cls = DummyClassifier(strategy="prior").fit(X_train, yc_train)
    metrics = {
        "dataset": str(data_path),
        "rows_loaded": int(len(raw)),
        "valid_rows": int(len(X)),
        "train_rows": int(len(X_train)),
        "test_rows": int(len(X_test)),
        "split_strategy": split_type,
        "target_regression": "arrival delay minutes (clipped to -180..1200)",
        "target_classification": "arrival delay > 15 minutes",
        "features": list(X.columns),
        "numeric_features": numeric,
        "categorical_features": categorical,
        "regression": {
            "random_forest": regression_metrics(yr_test, reg_pred),
            "median_baseline": regression_metrics(yr_test, baseline_reg.predict(X_test)),
        },
        "classification": {
            "random_forest": classification_metrics(yc_test, cls_pred, cls_prob),
            "prior_baseline": classification_metrics(yc_test, baseline_cls.predict(X_test),
                                                      baseline_cls.predict_proba(X_test)[:, list(baseline_cls.named_steps["model"].classes_).index(1)]
                                                      if 1 in baseline_cls.named_steps["model"].classes_ else np.zeros(len(X_test))),
        },
        "software": {"python": sys.version.split()[0], "scikit_learn": sklearn.__version__},
        "notes": [
            "A chronological holdout is used when a sufficiently complete flight date is available.",
            "Only scheduled/calendar/route/carrier/distance/congestion fields are used; actual delay causes and actual departure/arrival times are excluded.",
            "Metrics are holdout metrics, not a guarantee of live performance. Dataset representativeness matters.",
        ],
    }

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    bundle = {
        "regressor": regressor,
        "classifier": classifier,
        "features": list(X.columns),
        "numeric_features": numeric,
        "categorical_features": categorical,
        "target_definition": {"delay_minutes": "arrival delay in minutes", "delayed": "arrival delay > 15 minutes"},
        "metrics": metrics,
    }
    joblib.dump(bundle, output_dir / "flight_delay_model.joblib")
    (output_dir / "evaluation_metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(json.dumps(metrics, indent=2))
    print(f"\nSaved model: {output_dir / 'flight_delay_model.joblib'}")
    print(f"Saved evaluation: {output_dir / 'evaluation_metrics.json'}")


if __name__ == "__main__":
    main()
