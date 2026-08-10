import json
import pathlib

import joblib

ARTIFACTS_DIR = pathlib.Path(__file__).parent / "artifacts"

_pipeline = None
_metadata = None


def _load():
    global _pipeline, _metadata
    if _pipeline is None:
        _pipeline = joblib.load(ARTIFACTS_DIR / "model.joblib")
        _metadata = json.loads((ARTIFACTS_DIR / "metadata.json").read_text())
    return _pipeline, _metadata


def predict_noshow_probability(features: dict) -> tuple[float, str]:
    pipeline, metadata = _load()
    import pandas as pd

    row = pd.DataFrame([{f: features[f] for f in metadata["features"]}])
    probability = float(pipeline.predict_proba(row)[0, 1])
    return probability, metadata["modelVersion"]
