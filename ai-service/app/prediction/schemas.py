"""Prediction input/output schemas."""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class DelayPredictionRequest(BaseModel):
    flightNumber: str = Field(..., min_length=1, max_length=20)
    scheduledDeparture: Optional[str] = None
    carrier: Optional[str] = None
    origin: Optional[str] = None
    destination: Optional[str] = None
    distanceKm: Optional[int] = None
    airportCongestion: Optional[float] = None
    weatherFeatures: Optional[dict] = None
    featureSchemaVersion: Optional[str] = "1"

class DelayPredictionResponse(BaseModel):
    predictedArrivalDelayMinutes: float
    significantDelayProbability: float
    predictionGeneratedAt: str
    modelVersion: str
    status: str  # AVAILABLE | UNAVAILABLE
