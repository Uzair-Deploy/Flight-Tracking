"""Feature validation and transforms for delay prediction."""
from typing import Any, Optional
from pydantic import BaseModel, Field, field_validator


class PredictionFeatures(BaseModel):
    """Validated feature set for delay prediction."""
    flightNumber: str = Field(..., min_length=1, max_length=20)
    scheduledDeparture: Optional[str] = None
    carrier: Optional[str] = Field(None, min_length=1, max_length=10)
    origin: Optional[str] = Field(None, min_length=3, max_length=3)
    destination: Optional[str] = Field(None, min_length=3, max_length=3)
    distanceKm: Optional[int] = Field(None, ge=0, le=20000)
    airportCongestion: Optional[float] = Field(None, ge=0.0, le=1.0)
    weatherFeatures: Optional[dict] = None
    featureSchemaVersion: str = "1"

    @field_validator("origin", "destination", mode="before")
    @classmethod
    def _uppercase_iata(cls, v):
        if v is not None:
            return v.upper()
        return v

    @field_validator("carrier", mode="before")
    @classmethod
    def _uppercase_carrier(cls, v):
        if v is not None:
            return v.upper()
        return v

    def to_model_features(self) -> dict:
        """Convert to model feature dict."""
        features = {
            "flightNumber": self.flightNumber,
        }

        if self.scheduledDeparture:
            features["scheduledDeparture"] = self.scheduledDeparture
        if self.carrier:
            features["carrier"] = self.carrier
        if self.origin:
            features["origin"] = self.origin
        if self.destination:
            features["destination"] = self.destination
        if self.distanceKm is not None:
            features["distanceKm"] = self.distanceKm
        if self.airportCongestion is not None:
            features["airportCongestion"] = self.airportCongestion
        if self.weatherFeatures is not None:
            for k, v in self.weatherFeatures.items():
                features[f"weather_{k}"] = v

        return features


def validate_features(data: dict) -> PredictionFeatures:
    """Validate and normalize features."""
    return PredictionFeatures(**data)


def get_feature_schema_version() -> str:
    return "1"