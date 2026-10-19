"""Model loader and validation."""
import os
import logging
import pickle
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
            with open(path, "rb") as f:
                artifact = pickle.load(f)

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

        try:
            delay = self._model.predict([features])[0]
            proba = None
            if hasattr(self._model, "predict_proba"):
                proba = self._model.predict_proba([features])[0][1]  # probability of class 1 (delay >= 15)

            return {
                "predicted_arrival_delay_minutes": float(delay),
                "significant_delay_probability": float(proba) if proba is not None else 0.0,
            }
        except Exception as e:
            logger.exception("Prediction failed: %s", e)
            raise

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