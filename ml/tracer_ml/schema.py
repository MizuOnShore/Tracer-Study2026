from __future__ import annotations

import re
from typing import Any

import pandas as pd

GRADUATION_YEARS = set(range(2018, 2026))
STRANDS = {"ABM", "GAS", "HUMMS", "ICT", "STEM", "SPORTS", "TVL"}
STATUSES = {"higher_education", "employed", "self_employed", "training", "neet"}

REQUIRED_COLUMNS = [
    "email", "full_name", "gender", "age", "graduation_year", "strand",
    "certification", "current_status", "subject_relevance", "preparedness",
    "challenges", "support_needed", "feedback",
]

# Clustering describes observed transition patterns. Production inference can use
# the same approved tracer indicators, but never names clusters before profiling.
PATHWAY_NOMINAL_FEATURES = [
    "gender", "strand", "certification", "current_status",
    "higher_education_relation", "employment_relation", "business_relation",
    "training_relation", "actively_seeking",
]
PATHWAY_NUMERIC_FEATURES = ["age", "graduation_year", "subject_relevance", "preparedness"]

# Outcome-defining status and branch fields are deliberately excluded from NEET
# predictors. Including them would let the model read the answer from the input.
NEET_NOMINAL_FEATURES = ["gender", "strand", "certification"]
NEET_NUMERIC_FEATURES = ["age", "graduation_year", "subject_relevance", "preparedness"]


def construct_neet_target(frame: pd.DataFrame) -> pd.Series:
    """NEET means not in education, employment, entrepreneurship, or training."""
    if "current_status" not in frame:
        raise ValueError("current_status is required to construct the NEET target")
    unknown = set(frame["current_status"].dropna().unique()) - STATUSES
    if unknown:
        raise ValueError(f"Unknown current_status values: {sorted(unknown)}")
    return frame["current_status"].eq("neet").astype("int8").rename("is_neet")


def normalize_frame(raw: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, int]]:
    missing = sorted(set(REQUIRED_COLUMNS) - set(raw.columns))
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(missing)}")
    frame = raw.copy()
    original_count = len(frame)
    frame.columns = [str(column).strip().lower() for column in frame.columns]
    for column in frame.select_dtypes(include="object"):
        frame[column] = frame[column].map(lambda value: re.sub(r"\s+", " ", value.strip()) if isinstance(value, str) else value)
    frame["email"] = frame["email"].str.lower()
    frame["strand"] = frame["strand"].str.upper()
    frame["current_status"] = frame["current_status"].str.lower().str.replace(r"[\s-]+", "_", regex=True)
    for column in PATHWAY_NUMERIC_FEATURES:
        frame[column] = pd.to_numeric(frame[column], errors="coerce")

    frame = frame.drop_duplicates(subset=["email", "full_name", "graduation_year"], keep="first")
    valid = (
        frame["email"].str.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", na=False)
        & frame["age"].between(14, 100)
        & frame["graduation_year"].isin(GRADUATION_YEARS)
        & frame["strand"].isin(STRANDS)
        & frame["current_status"].isin(STATUSES)
        & frame["subject_relevance"].between(1, 5)
        & frame["preparedness"].between(1, 5)
    )
    invalid_count = int((~valid).sum())
    frame = frame.loc[valid].reset_index(drop=True)
    for column in set(PATHWAY_NOMINAL_FEATURES + NEET_NOMINAL_FEATURES):
        if column not in frame:
            frame[column] = pd.NA
    return frame, {
        "input_rows": original_count,
        "duplicates_removed": original_count - len(raw.drop_duplicates(subset=["email", "full_name", "graduation_year"])),
        "invalid_rows_removed": invalid_count,
        "usable_rows": len(frame),
    }


def record_to_frame(record: dict[str, Any], features: list[str]) -> pd.DataFrame:
    return pd.DataFrame([{feature: record.get(feature) for feature in features}], columns=features)
