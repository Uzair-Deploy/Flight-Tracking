"""Delay prediction inference service."""
import logging
from datetime import datetime, timezone
from typing import Optional

from app.prediction.model_loader import get_model_loader
from app.prediction.features import validate_features, get_feature_schema_version
from app.prediction.schemas import DelayPredictionRequest, DelayPredictionResponse

logger = logging.getLogger(__name__)


class DelayPredictionService:
    def __init__(self):
        self._model_loader = get_model_loader()

    def predict(self, request: DelayPredictionRequest) -> DelayPredictionResponse:
        if not self._model_loader.is_loaded:
            return DelayPredictionResponse(
                predictedArrivalDelayMinutes=0.0,
                significantDelayProbability=0.0,
                predictionGeneratedAt=datetime.now(timezone.utc).isoformat(),
                modelVersion="not-loaded",
                status="UNAVAILABLE",
            )

        try:
            features = validate_features(request.model_dump())
            model_features = features.to_model_features()

            result = self._model_loader.predict(model_features)

            return DelayPredictionResponse(
                predictedArrivalDelayMinutes=result["predicted_arrival_delay_minutes"],
                significantDelayProbability=result["significant_delay_probability"],
                predictionGeneratedAt=datetime.now(timezone.utc).isoformat(),
                modelVersion=self._model_loader.model_version,
                status="AVAILABLE",
            )
        except Exception as e:
            import traceback, sys
            logger.exception("Prediction failed: %s", e)
            traceback.print_exc(file=sys.stdout)
            return DelayPredictionResponse(
                predictedArrivalDelayMinutes=0.0,
                significantDelayProbability=0.0,
                predictionGeneratedAt=datetime.now(timezone.utc).isoformat(),
                modelVersion=self._model_loader.model_version if self._model_loader.is_loaded else "error",
                status="UNAVAILABLE",
            )

    def is_ready(self) -> bool:
        return self._model_loader.is_loaded


_delay_prediction_service: Optional[DelayPredictionService] = None


def get_delay_prediction_service() -> DelayPredictionService:
    global _delay_prediction_service
    if _delay_prediction_service is None:
        _delay_prediction_service = DelayPredictionService()
    return _delay_prediction_service