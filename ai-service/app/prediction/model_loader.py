"""Model loader and validation."""
import os
import logging
import joblib
from typing import Any, Optional
from pathlib import Path

logger = logging.getLogger(__name__)

class ModelLoader:
    _instance: Optional["ModelLoader"] = None
    _model: Any = None
    _model_version: str = "unknown"
    _feature_schema_version: str = "1"
    _is_loaded: bool = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def load(self, model_path: Optional[str] = None) -> bool:
        if self._is_loaded and self._model is not None:
            return True

        if model_path is None:
            model_path = os.getenv("DELAY_MODEL_PATH", "models/delay_model.pkl")

        path = Path(model_path)
        if not path.exists():
            logger.warning("Model file not found at %s", path)
            return False

        try:
            artifact = joblib.load(path)

            if not isinstance(artifact, dict):
                logger.error("Model artifact must be a dict with keys: model, model_version, feature_schema_version")
                return False

            self._model = artifact.get("model")
            self._model_version = artifact.get("model_version", "unknown")
            self._feature_schema_version = artifact.get("feature_schema_version", "1")

            if self._model is None:
                logger.error("Model artifact missing 'model' key")
                return False

            self._is_loaded = True
            logger.info("Loaded model version %s, feature schema version %s",
                        self._model_version, self._feature_schema_version)
            return True
        except Exception as e:
            logger.exception("Failed to load model: %s", e)
            return False

    def predict(self, features: dict) -> dict:
        if not self._is_loaded or self._model is None:
            raise RuntimeError("Model not loaded")

        # Remap API feature names to training feature names
        model_features = self._remap_features(features)

        try:
            delay = self._model.predict([model_features])[0]
            proba = None
            if hasattr(self._model, "predict_proba"):
                proba = self._model.predict_proba([model_features])[0][1]  # probability of class 1 (delay >= 15)

            return {
                "predicted_arrival_delay_minutes": float(delay),
                "significant_delay_probability": float(proba) if proba is not None else 0.0,
            }
        except Exception as e:
            logger.exception("Prediction failed: %s", e)
            raise

    def _remap_features(self, features: dict) -> dict:
        """Map API feature names (carrier, distance_km, etc.) to training feature names (op_unique_carrier, distance)."""
        mapped = {}

        # carrier -> op_unique_carrier
        if "carrier" in features and features["carrier"]:
            mapped["op_unique_carrier"] = str(features["carrier"]).upper()
        else:
            # Default to a common carrier if missing
            mapped["op_unique_carrier"] = "9E"

        # distance_km -> distance (in miles, as model was trained on miles)
        if "distanceKm" in features and features["distanceKm"] is not None:
            mapped["distance"] = float(features["distanceKm"]) * 0.621371
        elif "distance" not in mapped:
            mapped["distance"] = 1000.0  # default ~1000 miles

        # origin and destination pass through (same names)
        if "origin" in features and features["origin"]:
            mapped["origin"] = str(features["origin"]).upper()
        if "destination" in features and features["destination"]:
            mapped["destination"] = str(features["destination"]).upper()

        # day_of_week and month: derive from scheduledDeparture if provided
        if "scheduledDeparture" in features and features["scheduledDeparture"]:
            try:
                from datetime import datetime
                dt = datetime.fromisoformat(str(features["scheduledDeparture"]))
                mapped["day_of_week"] = dt.weekday()  # 0=Monday
                mapped["month"] = dt.month
            except Exception:
                mapped["day_of_week"] = 0
                mapped["month"] = 1
        else:
            # Default: Monday, January if no date provided
            mapped["day_of_week"] = 0
            mapped["month"] = 1

        # carrier congestion if provided
        if "airportCongestion" in features and features["airportCongestion"] is not None:
            mapped["airport_congestion"] = float(features["airportCongestion"])

        # Keep any other existing model features
        for k, v in features.items():
            if k not in mapped and k in ["modelVersion", "featureSchemaVersion"]:
                pass  # skip metadata
            elif k not in mapped:
                mapped[k] = v

        return mapped

    @property
    def model(self) -> Any:
        return self._model

    @property
    def model_version(self) -> str:
        return self._model_version

    @property
    def feature_schema_version(self) -> str:
        return self._feature_schema_version

    @property
    def is_loaded(self) -> bool:
        return self._is_loaded


_model_loader = ModelLoader()


def get_model_loader() -> ModelLoader:
    return _model_loader