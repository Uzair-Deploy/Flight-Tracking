"""Evaluate a trained delay prediction model."""
import json
import sys
from pathlib import Path

import joblib
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    mean_absolute_error,
    mean_squared_error,
    precision_recall_fscore_support,
    r2_score,
    roc_auc_score,
)


def load_feature_schema():
    schema_path = Path(__file__).parent / "feature_schema.json"
    with open(schema_path) as f:
        return json.load(f)


def evaluate(model_path: str, test_csv: str):
    schema = load_feature_schema()
    artifact = joblib.load(model_path)

    reg_pipeline = artifact["model"]
    cls_pipeline = artifact.get("classifier")
    model_version = artifact.get("model_version", "unknown")

    df = pd.read_csv(test_csv)

    if "arrival_delay_minutes" not in df.columns:
        raise ValueError("Test CSV must contain 'arrival_delay_minutes'")

    if "status" in df.columns:
        df = df[~df["status"].isin(["cancelled", "diverted"])].copy()

    df["significant_delay"] = (df["arrival_delay_minutes"] >= 15).astype(int)

    numeric_features = [f["name"] for f in schema["features"] if f["type"] == "numeric"]
    categorical_features = [f["name"] for f in schema["features"] if f["type"] == "categorical"]

    available_numeric = [f for f in numeric_features if f in df.columns]
    available_categorical = [f for f in categorical_features if f in df.columns]

    X = df[available_numeric + available_categorical]
    y_reg = df["arrival_delay_minutes"]
    y_cls = df["significant_delay"]

    # Regression
    y_reg_pred = reg_pipeline.predict(X)
    mae = mean_absolute_error(y_reg, y_reg_pred)
    rmse = mean_squared_error(y_reg, y_reg_pred, squared=False)
    r2 = r2_score(y_reg, y_reg_pred)

    print("=== Regression ===")
    print(f"MAE: {mae:.2f} minutes")
    print(f"RMSE: {rmse:.2f} minutes")
    print(f"R2: {r2:.4f}")

    results = {
        "model_version": model_version,
        "regression": {"mae": mae, "rmse": rmse, "r2": r2},
    }

    # Classification
    if cls_pipeline is not None:
        y_cls_pred = cls_pipeline.predict(X)
        acc = accuracy_score(y_cls, y_cls_pred)
        precision, recall, f1, _ = precision_recall_fscore_support(y_cls, y_cls_pred, average="binary", zero_division=0)

        print("\n=== Classification ===")
        print(f"Accuracy: {acc:.4f}")
        print(f"Precision: {precision:.4f}")
        print(f"Recall: {recall:.4f}")
        print(f"F1: {f1:.4f}")
        print(classification_report(y_cls, y_cls_pred))

        results["classification"] = {
            "accuracy": acc,
            "precision": precision,
            "recall": recall,
            "f1": f1,
        }

        # ROC-AUC only if both classes present
        if y_cls.nunique() == 2:
            try:
                y_proba = cls_pipeline.predict_proba(X)[:, 1]
                roc_auc = roc_auc_score(y_cls, y_proba)
                results["classification"]["roc_auc"] = roc_auc
                print(f"ROC-AUC: {roc_auc:.4f}")
            except Exception as e:
                print(f"ROC-AUC not computable: {e}")

    return results


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python evaluate_model.py <model.pkl> <test.csv>")
        sys.exit(1)
    results = evaluate(sys.argv[1], sys.argv[2])
    print("\nJSON results:")
    print(json.dumps(results, indent=2))