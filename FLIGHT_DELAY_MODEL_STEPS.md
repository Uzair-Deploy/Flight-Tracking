# Flight-delay model improvement — implementation log

## Goal

Add a reproducible training and evaluation workflow for the flight-delay prediction factor, with metrics that are meaningful for both the website and model development.

## Changes made

1. Added `ml/train_model.py`.
   - Accepts a historical BTS-style CSV through a command-line argument instead of relying on a hard-coded machine-specific path.
   - Recognizes common column aliases, including `FL_DATE`, `ARR_DELAY`, `OP_UNIQUE_CARRIER`, `ORIGIN`, `DEST`, `CRS_DEP_TIME`, `DISTANCE`, and congestion fields.
   - Predicts arrival delay in minutes (regression) and whether arrival delay exceeds 15 minutes (classification).
   - Uses pre-departure features only: calendar fields, carrier, route, scheduled departure time, distance, and optional congestion index.
   - Excludes actual delay, delay-cause, actual departure/arrival time, and cancelled flights from the feature set/training rows to reduce target leakage.
   - Uses a chronological holdout when enough usable flight dates are present; otherwise prints a warning and uses a seeded random holdout.
   - Fits Random Forest regression and classification pipelines with imputation and one-hot encoding for categorical features.
   - Compares predictions with a median-delay regression baseline and a prior-probability classification baseline.
   - Reports MAE/RMSE/R² for delay minutes and accuracy/precision/recall/F1/ROC-AUC/average precision for the delayed-flight flag when mathematically defined.
   - Saves a reusable model bundle and JSON evaluation report.

## Run it locally

From the repository root, install the Python dependencies:

```bash
python -m pip install -r ml/requirements.txt
```

Then train against your real historical flight-delay CSV:

```bash
python ml/train_model.py --data data/flight_delay.csv --output-dir ml/artifacts
```

If your CSV is elsewhere, change `--data` to that path. At least 30 usable records are required by the script; real model evaluation generally needs substantially more data covering multiple months, airports, carriers, and seasons.

Generated artifacts:
- `ml/artifacts/flight_delay_model.joblib`
- `ml/artifacts/evaluation_metrics.json`

Do not commit large private/raw datasets or secrets. The model artifacts are generated locally and should only be committed if the repository's deployment process explicitly requires them.

## How to interpret the evaluation

- **MAE (minutes):** average absolute error in predicted arrival delay; lower is better.
- **RMSE (minutes):** penalizes large prediction errors more heavily; lower is better.
- **R²:** compares the model with predicting the test-set mean; it can be negative, especially with small or unrepresentative data.
- **Precision / recall / F1:** assess the classification of flights delayed by more than 15 minutes.
- **ROC-AUC / average precision:** threshold-independent ranking measures; omitted as null if the holdout contains only one class.
- Compare each model with its baseline. Do not describe R² as “accuracy” or present metrics from a tiny sample as production performance.

## Website / live-flight integration plan

The trained bundle is Python/scikit-learn, while the main application includes a Spring Boot backend. The model does not become active on the website merely by training it. To expose live predictions, deploy a small Python inference service (for example, FastAPI) that loads `flight_delay_model.joblib`, validates the input fields, and returns a stable JSON response. Then have the Spring Boot backend call that service and map the result to the frontend's flight-card/API response.

Suggested prediction response:

```json
{
  "predictedArrivalDelayMinutes": 18.4,
  "delayedOver15MinutesProbability": 0.67,
  "delayRisk": "HIGH",
  "modelVersion": "flight-delay-rf-v1",
  "predictionAvailable": true
}
```

Suggested risk labels are configurable presentation rules, not calibrated probabilities: LOW below 0.30, MEDIUM from 0.30 to below 0.60, HIGH at or above 0.60. Validate and calibrate these thresholds against the held-out data before displaying them to users. If the prediction service or required inputs are unavailable, return “prediction unavailable” rather than silently substituting fabricated/sample predictions.

For congestion to add value, join an airport congestion dataset using a time-correct key (airport + relevant date/time window). Do not join future realized congestion into a prediction that is supposed to be made before departure. The training CSV should contain congestion values that would actually have been available at prediction time.

## Verification status and limitations

- The new training/evaluation script and documentation were committed to the `improve/flight-delay-model-evaluation` branch.
- The script has not been run against your private/local dataset in this environment, so no model score or claim of improved accuracy is reported here.
- This change adds the model training foundation. The existing Spring Boot API and frontend still need a compatible inference endpoint and response mapping before predictions appear on the live website.
