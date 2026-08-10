"""Trains a logistic-regression no-show classifier on the synthetic dataset
and writes model.joblib + metadata.json into ml-service/app/artifacts/, which
app/model.py loads at startup. Re-run after regenerating the dataset.
"""

import json
import pathlib

import joblib
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

FEATURES = ["lead_time_hours", "hour_of_day", "day_of_week", "prior_noshow_rate", "is_telemedicine"]
MODEL_VERSION = "noshow-logreg-v1"

if __name__ == "__main__":
    data_path = pathlib.Path(__file__).parent / "data" / "appointments.csv"
    if not data_path.exists():
        raise SystemExit("Run generate_synthetic_data.py first")

    df = pd.read_csv(data_path)
    X, y = df[FEATURES], df["no_show"]
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    pipeline = Pipeline([("scale", StandardScaler()), ("clf", LogisticRegression(max_iter=1000))])
    pipeline.fit(X_train, y_train)

    auc = roc_auc_score(y_test, pipeline.predict_proba(X_test)[:, 1])
    print(f"Held-out AUC: {auc:.3f}")

    artifacts_dir = pathlib.Path(__file__).parent.parent / "app" / "artifacts"
    artifacts_dir.mkdir(exist_ok=True)
    joblib.dump(pipeline, artifacts_dir / "model.joblib")
    (artifacts_dir / "metadata.json").write_text(
        json.dumps({"modelVersion": MODEL_VERSION, "features": FEATURES, "heldOutAuc": round(auc, 3)}, indent=2)
    )
    print(f"Wrote model artifacts to {artifacts_dir}")
