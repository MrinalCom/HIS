"""Generates a synthetic appointment no-show dataset. Not real patient data —
labels are produced by a hand-written probability function with noise, purely
so train_noshow_model.py has something plausible to fit. Re-run any time to
regenerate ml-service/training/data/appointments.csv.
"""

import numpy as np
import pandas as pd

RNG = np.random.default_rng(42)
N = 4000


def generate() -> pd.DataFrame:
    lead_time_hours = RNG.exponential(scale=48, size=N).clip(0, 24 * 30)
    hour_of_day = RNG.integers(9, 17, size=N)
    day_of_week = RNG.integers(0, 7, size=N)
    prior_noshow_rate = RNG.beta(1.5, 6, size=N)
    is_telemedicine = RNG.integers(0, 2, size=N)

    # Hand-authored logit combining the features above with directionally
    # sensible weights (more lead time / early morning / weekend / prior
    # no-shows all raise risk; telemedicine lowers it), plus noise.
    logit = (
        -1.8
        + 0.010 * lead_time_hours
        + 0.15 * (hour_of_day == 9)
        + 0.25 * (day_of_week >= 5)
        + 3.2 * prior_noshow_rate
        - 0.6 * is_telemedicine
        + RNG.normal(0, 0.4, size=N)
    )
    prob = 1 / (1 + np.exp(-logit))
    no_show = RNG.binomial(1, prob)

    return pd.DataFrame(
        {
            "lead_time_hours": lead_time_hours,
            "hour_of_day": hour_of_day,
            "day_of_week": day_of_week,
            "prior_noshow_rate": prior_noshow_rate,
            "is_telemedicine": is_telemedicine,
            "no_show": no_show,
        }
    )


if __name__ == "__main__":
    import pathlib

    out_dir = pathlib.Path(__file__).parent / "data"
    out_dir.mkdir(exist_ok=True)
    df = generate()
    df.to_csv(out_dir / "appointments.csv", index=False)
    print(f"Wrote {len(df)} rows to {out_dir / 'appointments.csv'}")
