# Flight Delay ML Model

Offline training and evaluation for the flight-delay prediction feature.

## Data

Provide a historical flight dataset with at minimum:
- `arrival_delay_minutes` (target; negative = early)
- `status` (exclude `cancelled` / `diverted` rows)
- Optional feature columns: `carrier`, `origin`, `destination`, `distance_km`, `airport_congestion`, `scheduled_departure`, `weather_*`

Do not commit private datasets. Keep them outside the repository or in a gitignored path.

## Feature schema

See `feature_schema.json`. The schema version must match the `featureSchemaVersion` used by the API.

## Train

```bash
pip install -r requirements.txt
python train_model.py path/to/dataset.csv path/to/delay_model.pkl
```

Outputs a `joblib` artifact containing:
- `model` – regression pipeline (arrival delay minutes)
- `classifier` – classification pipeline (delay >= 15 minutes)
- `model_version`, `feature_schema_version`, `metrics`, `package_versions`

## Evaluate

```bash
python evaluate_model.py path/to/delay_model.pkl path/to/test.csv
```

Reports MAE, RMSE, R², precision/recall/F1, and ROC-AUC (when both classes present).

## Promotion

Copy the approved artifact to `ai-service/models/delay_model.pkl` (or set `DELAY_MODEL_PATH`).
Only promote after chronological holdout evaluation and comparison with a baseline.
