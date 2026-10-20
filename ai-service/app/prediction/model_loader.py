"""Model loader and validation."""
import os
import logging
import joblib
import pandas as pd
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
            model_path = os.getenv("DELAY_MODEL_PATH")
        if not model_path:
            model_path = (
                Path(__file__).resolve().parents[2]
                / "models"
                / "delay_model.pkl"
            )

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
            self._classifier = artifact.get("classifier")
            self._model_version = artifact.get("model_version", "unknown")
            self._feature_schema_version = artifact.get("feature_schema_version", "1")

            if self._model is None:
                logger.error("Model artifact missing 'model' key")
                return False

            # Store expected feature names for DataFrame column ordering
            if hasattr(self._model, "feature_names_in_"):
                self._feature_names = list(self._model.feature_names_in_)
            else:
                self._feature_names = [
                    "crs_dep_time", "crs_arr_time", "crs_elapsed_time", "distance",
                    "day_of_week", "month", "op_unique_carrier", "origin"
                ]

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
            import pandas as pd
            frame = pd.DataFrame([model_features], columns=self._feature_names)
            delay = float(self._model.predict(frame)[0])

            probability = 0.0
            if self._classifier is not None:
                classes = list(self._classifier.classes_)
                if 1 in classes:
                    probabilities = self._classifier.predict_proba(frame)[0]
                    probability = float(probabilities[classes.index(1)])
            elif hasattr(self._model, "predict_proba"):
                probability = float(self._model.predict_proba(frame)[0][1])

            return {
                "predicted_arrival_delay_minutes": delay,
                "significant_delay_probability": probability,
            }
        except Exception as e:
            import traceback, sys
            logger.exception("Prediction failed: %s", e)
            traceback.print_exc(file=sys.stdout)
            raise

    def _remap_features(self, features: dict) -> dict:
        """Map API feature names to training feature names.
        
        Training features: crs_dep_time, crs_arr_time, crs_elapsed_time, distance, 
        day_of_week, month, op_unique_carrier, origin
        """
        mapped = {}

        # carrier -> op_unique_carrier
        if "carrier" in features and features["carrier"]:
            mapped["op_unique_carrier"] = str(features["carrier"]).upper()
        else:
            mapped["op_unique_carrier"] = "9E"

        # distanceKm -> distance (in miles, as model was trained on miles)
        if "distanceKm" in features and features["distanceKm"] is not None:
            mapped["distance"] = float(features["distanceKm"]) * 0.621371
        elif "distance" not in mapped:
            mapped["distance"] = 1000.0  # default ~1000 miles

        # origin (same name)
        if "origin" in features and features["origin"]:
            mapped["origin"] = str(features["origin"]).upper()

        # Derive time features from scheduledDeparture
        if "scheduledDeparture" in features and features["scheduledDeparture"]:
            try:
                from datetime import datetime
                dt = datetime.fromisoformat(str(features["scheduledDeparture"]))
                mapped["day_of_week"] = dt.weekday()  # 0=Monday
                mapped["month"] = dt.month
                # crs_dep_time in HHMM format (e.g., 1430 for 14:30)
                mapped["crs_dep_time"] = dt.hour * 100 + dt.minute
            except Exception:
                mapped["day_of_week"] = 0
                mapped["month"] = 1
                mapped["crs_dep_time"] = 1200  # default noon
        else:
            mapped["day_of_week"] = 0
            mapped["month"] = 1
            mapped["crs_dep_time"] = 1200  # default noon

        # Estimate crs_arr_time and crs_elapsed_time from typical flight duration
        # We don't have actual scheduled arrival, so use typical duration based on distance
        # Average ~500 mph => hours = distance/500, minutes = distance/500 * 60
        distance_miles = mapped.get("distance", 1000.0)
        estimated_hours = distance_miles / 500.0
        estimated_minutes = int(estimated_hours * 60)
        dep_time = mapped["crs_dep_time"]
        dep_hours = dep_time // 100
        dep_minutes = dep_time % 100
        total_min = dep_hours * 60 + dep_minutes + estimated_minutes
        arr_hours = (total_min // 60) % 24
        arr_minutes = total_min % 60
        mapped["crs_arr_time"] = arr_hours * 100 + arr_minutes
        mapped["crs_elapsed_time"] = float(estimated_minutes)

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