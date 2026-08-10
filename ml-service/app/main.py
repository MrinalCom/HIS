from fastapi import FastAPI, HTTPException

from .model import predict_noshow_probability
from .schemas import NoShowFeatures, NoShowPrediction

app = FastAPI(title="HIS ML Service")


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/predict", response_model=NoShowPrediction)
def predict(features: NoShowFeatures) -> NoShowPrediction:
    try:
        probability, model_version = predict_noshow_probability(features.model_dump())
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail="Model artifacts not trained yet") from exc
    return NoShowPrediction(probability=probability, modelVersion=model_version)
