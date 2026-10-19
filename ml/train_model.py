"""Train a flight delay prediction model."""
import json
import os
import sys
from pathlib import Path

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    mean_absolute_error,
    mean_squared_error,
    r2_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from datetime import datetime, timezone


def load_feature_schema():
    schema_path = Path(__file__).parent / "feature_schema.json"
    with open(schema_path) as f:
        return json.load(f)


def prepare_features(df: pd.DataFrame, schema: dict) -> tuple[pd.DataFrame, list[str], list[str]]:
    numeric_features = []
    categorical_features = []

    for feat in schema["features"]:
        if feat["type"] == "numeric":
            numeric_features.append(feat["name"])
        elif feat["type"] == "categorical":
            categorical_features.append(feat["name"])

    available_numeric = [f for f in numeric_features if f in df.columns]
    available_categorical = [f for f in categorical_features if f in df.columns]

    return df[available_numeric + available_categorical], available_numeric, available_categorical


def train(df_path: str, output_path: str):
    # Quick sampling for faster testing (reduce to 500 rows)
    schema = load_feature_schema()
    df = pd.read_csv(df_path)
    # Take a subset for speed
    df = df.sample(min(500, len(df)), random_state=42).reset_index(drop=True)

    # Target
    if "arrival_delay_minutes" not in df.columns:
        raise ValueError("Dataset must contain 'arrival_delay_minutes' column")

    # Drop cancelled/diverted if present
    if "status" in df.columns:
        df = df[~df["status"].isin(["cancelled", "diverted"])].copy()

<<<<<<< HEAD
    df["arrival_delay_minutes"] = df["arrival_delay_minutes"].astype(float)
    # Drop rows with missing target
    df = df.dropna(subset=["arrival_delay_minutes"])
=======
>>>>>>> parent of d0ac22f (Import data files)
    # Classification target
    df["significant_delay"] = (df["arrival_delay_minutes"] >= 15).astype(int)

    X, numeric_features, categorical_features = prepare_features(df, schema)

    # Ensure there is at least one sample
    if len(X) == 0:
        raise ValueError("No samples left after feature extraction. Check feature names in schema.")

    # Chronological split (assume df has year/month/day_of_month -> convert to integer key)
    df["date_key"] = df["year"].astype(str) + df["month"].astype(str).str.zfill(2) + df["day_of_month"].astype(str).str.zfill(2)
    df = df.sort_values("date_key")
    split_idx = int(len(df) * 0.7)
    val_idx = int(len(df) * 0.85)

    X = X.loc[df.index]
    y_regression = df["arrival_delay_minutes"].loc[df.index]
    y_classification = df["significant_delay"].loc[df.index]

    X_train = X.iloc[:split_idx]
    X_val = X.iloc[split_idx:val_idx]
    X_test = X.iloc[val_idx:]

    y_reg_train = y_regression.iloc[:split_idx]
    y_reg_val = y_regression.iloc[split_idx:val_idx]
    y_reg_test = y_regression.iloc[val_idx:]

    y_cls_train = y_classification.iloc[:split_idx]
    y_cls_val = y_classification.iloc[split_idx:val_idx]
    y_cls_test = y_classification.iloc[val_idx:]

    # Preprocessing
    preprocessor = ColumnTransformer(
        transformers=[
            ("num", SimpleImputer(strategy="median"), numeric_features),
            ("cat", Pipeline([("imputer", SimpleImputer(strategy="most_frequent")),
                              ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False))]),
             categorical_features),
        ],
        remainder="drop",
    )

    # Regression pipeline
    reg_pipeline = Pipeline([
        ("preprocessor", preprocessor),
        ("regressor", RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1)),
    ])
    reg_pipeline.fit(X_train, y_reg_train)

    # Classification pipeline
    cls_pipeline = Pipeline([
        ("preprocessor", preprocessor),
        ("classifier", RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1)),
    ])
    cls_pipeline.fit(X_train, y_cls_train)

    # Evaluate on test
    y_reg_pred = reg_pipeline.predict(X_test)
    y_cls_pred = cls_pipeline.predict(X_test)

    mae = mean_absolute_error(y_reg_test, y_reg_pred)
    rmse = mean_squared_error(y_reg_test, y_reg_pred) ** 0.5
    r2 = r2_score(y_reg_test, y_reg_pred)

    acc = accuracy_score(y_cls_test, y_cls_pred)
    print(f"Regression: MAE={mae:.2f}, RMSE={rmse:.2f}, R2={r2:.4f}")
    print(f"Classification: Accuracy={acc:.4f}")
    print(classification_report(y_cls_test, y_cls_pred))

    # Save artifact
    model_version = f"delay-model-{datetime.now(timezone.utc).strftime('%Y.%m.%d')}"
    artifact = {
        "model": reg_pipeline,
        "classifier": cls_pipeline,
        "model_version": model_version,
        "feature_schema_version": schema["version"],
        "metrics": {
            "regression": {"mae": mae, "rmse": rmse, "r2": r2},
            "classification": {"accuracy": acc},
        },
        "train_date_range": {
            "train_start": str(X_train.index.min()) if len(X_train) > 0 else None,
            "train_end": str(X_train.index.max()) if len(X_train) > 0 else None,
        },
        "package_versions": {
            "sklearn": __import__("sklearn").__version__,
            "pandas": pd.__version__,
        },
    }

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    joblib.dump(artifact, output_path)
    print(f"Saved model to {output_path}")
    print(f"Model version: {model_version}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python train_model.py <dataset.csv> <output_model.pkl>")
        sys.exit(1)
    train(sys.argv[1], sys.argv[2])