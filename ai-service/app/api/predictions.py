"""Delay prediction endpoint."""
import logging
from fastapi import APIRouter, Request
from app.prediction.schemas import DelayPredictionRequest, DelayPredictionResponse
from app.prediction.service import get_delay_prediction_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["predictions"])


@router.post("/predictions/delay", response_model=DelayPredictionResponse)
async def predict_delay(request: DelayPredictionRequest, http_request: Request):
    """Predict arrival delay for a flight."""
    service = get_delay_prediction_service()
    response = service.predict(request)
    return response


@router.get("/predictions/ready")
async def predictions_ready():
    """Readiness check for prediction service."""
    service = get_delay_prediction_service()
    return {
        "status": "READY" if service.is_ready() else "NOT_READY",
        "service": "flight-tracking-ai-service",
    }