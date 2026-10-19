# Flight-Delay ML Model Integration

Supervised delay-prediction feature for the Flight-Tracking project: React frontend → Spring Boot API → FastAPI AI service → offline-trained scikit-learn artifact.

## Architecture

```
React + TypeScript frontend
        |
        | GET /api/flights/{flightNumber}/delay-prediction
        v
Spring Boot backend
  - validates request, applies auth (bearer JWT)
  - enriches with flight context via FlightService
  - calls FastAPI via AiServiceClient (private, timeout-guarded)
        |
        | POST /api/predictions/delay
        v
FastAPI ai-service
  - validates feature schema (app/prediction/features.py)
  - loads versioned artifact once (app/prediction/model_loader.py)
  - returns delay estimate + significant-delay risk probability
        ^
        |
ml/ offline training pipeline (not part of a web request)
  - trains RandomForest regressor + classifier
  - chronological split, evaluates on holdout
  - saves joblib artifact to ai-service/models/delay_model.pkl
```

## Prediction contract

Outputs (per `docs/ML_MODEL_INTEGRATION_README.md` §4):

| Field | Type | Notes |
|---|---|---|
| `predictedArrivalDelayMinutes` | float | estimated arrival delay in minutes |
| `significantDelayProbability` | float | P(arrival delay ≥ 15 min) |
| `predictionGeneratedAt` | ISO timestamp | metadata |
| `modelVersion` | string | artifact identifier |
| `status` | `AVAILABLE` \| `UNAVAILABLE` | stable unavailable/error response |

Prediction time: **before departure**, using only information known at that moment (schedule, carrier, route). Optional features (congestion, weather) are explicitly nullable.

## Feature schema

`ml/feature_schema.json` (version `1`) — derived from `data/flight_delay.csv`:

- categorical: `op_unique_carrier`, `origin`, `dest`
- numeric: `crs_dep_time`, `crs_arr_time`, `crs_elapsed_time`, `distance`, `day_of_week`, `month`
- target: `arr_delay` (renamed `arrival_delay_minutes` during training), negative = early
- classification target: `significant_delay = arr_delay >= 15`

Cancelled/diverted flights are excluded when a `status` column exists; missing target rows are dropped.

## Training

```bash
cd ml
pip install -r requirements.txt
python train_model.py ..\data\flight_delay.csv ..\ai-service\models\delay_model.pkl
python evaluate_model.py ..\ai-service\models\delay_model.pkl ..\data\flight_delay.csv
```

Artifact keys: `model` (regression pipeline), `classifier`, `model_version`, `feature_schema_version`, `metrics`, `package_versions`.

## Serving

```bash
cd ai-service
pip install -r requirements.txt        # includes scikit-learn + joblib
uvicorn app.main:app --reload --port 8001
```

- `POST /api/predictions/delay` — inference (guarded by `X-AI-Service-Key` when configured)
- `GET /api/predictions/ready` — readiness (checks artifact loaded)
- Artifact path from `DELAY_MODEL_PATH` (default `models/delay_model.pkl`)

## Backend wiring

- `DelayPredictionController` → `GET /api/flights/{flightNumber}/delay-prediction`
- `DelayPredictionService` → builds request from `FlightService` context, maps AI-service outage to `status: UNAVAILABLE`
- `AiServiceClient.predictDelay()` → `POST /api/predictions/delay` with `X-AI-Service-Key`, timeouts from `app.ai.timeout-ms`

Configured via `app.ai.*` in `application.yml` (base URL, timeout, API key).

## Frontend

- `frontend/src/services/delayPredictionService.ts` — typed API client
- `frontend/src/types/api.ts` — `DelayPredictionResponse`
- `TrackingPage.tsx` — "Delay Prediction" card (loading / success / unavailable / error states), labelled as an estimate; live tracking remains functional when prediction fails

## Testing checklist

- Training: schema/target validated, no improper date overlap, leakage-free features, reproducible save/load
- FastAPI: valid input → documented schema; missing/invalid → validation error or `UNAVAILABLE`; artifact missing detected at readiness; finite in-range output for known input
- Spring Boot: response mapping, timeout/auth/outage handled, existing endpoints unaffected
- Frontend: all UI states render, output labelled as estimate, tracking works when predictions fail

## Monitoring / retraining

Log model version, timestamp, latency, status, missing-feature flags. Compare predictions to actual arrival outcomes (MAE/RMSE over time), monitor by airport/carrier/route, retrain on schedule or on measured degradation, and re-run holdout evaluation before promoting a replacement artifact.
