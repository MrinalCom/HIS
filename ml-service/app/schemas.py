from pydantic import BaseModel


class NoShowFeatures(BaseModel):
    lead_time_hours: float
    hour_of_day: int
    day_of_week: int
    prior_noshow_rate: float
    is_telemedicine: int


class NoShowPrediction(BaseModel):
    probability: float
    modelVersion: str
