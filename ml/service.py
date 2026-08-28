from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Literal

import numpy as np
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from supabase import create_client

from tracer_ml.artifacts import load_verified_bundle
from tracer_ml.schema import record_to_frame

ARTIFACT_DIR = Path(os.getenv("ARTIFACT_DIR", "artifacts"))
SERVICE_TOKEN = os.getenv("ML_SERVICE_TOKEN", "")


def sync_active_artifacts() -> None:
    """Download only explicitly active registry versions from private storage."""
    url = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        return
    client = create_client(url, key)
    rows = client.table("model_registry").select("kind,version,artifact_path,metadata_path,sha256").eq("status", "active").execute().data
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    for row in rows:
        if not row.get("artifact_path") or not row.get("metadata_path"):
            continue
        artifact_bytes = client.storage.from_("model-artifacts").download(row["artifact_path"])
        metadata_bytes = client.storage.from_("model-artifacts").download(row["metadata_path"])
        artifact_path = ARTIFACT_DIR / f"{row['kind']}-{row['version']}.joblib"
        metadata_path = ARTIFACT_DIR / f"{row['kind']}-{row['version']}.metadata.json"
        artifact_temp = artifact_path.with_suffix(".joblib.tmp")
        metadata_temp = metadata_path.with_suffix(".json.tmp")
        artifact_temp.write_bytes(artifact_bytes)
        metadata_temp.write_bytes(metadata_bytes)
        # Verification occurs before the temporary files replace a working copy.
        load_verified_bundle(artifact_temp, metadata_temp)
        artifact_temp.replace(artifact_path)
        metadata_temp.replace(metadata_path)


class PredictionRequest(BaseModel):
    model_config = ConfigDict(extra="allow")
    expected_model_version: str = Field(min_length=1, max_length=100)
    record: dict[str, Any]


class BatchRecord(BaseModel):
    source_row: int = Field(gt=1)
    record: dict[str, Any]


class ExpectedModelVersions(BaseModel):
    pathway: str = Field(min_length=1, max_length=100)
    neet: str = Field(min_length=1, max_length=100)


class BatchPredictionRequest(BaseModel):
    expected_model_versions: ExpectedModelVersions
    records: list[BatchRecord] = Field(min_length=1, max_length=2000)


class ArtifactState:
    def __init__(self) -> None:
        self.models: dict[str, tuple[dict[str, Any], dict[str, Any]]] = {}
        for kind in ("pathway", "neet"):
            metadata_files = sorted(ARTIFACT_DIR.glob(f"{kind}-*.metadata.json"), reverse=True)
            for metadata_path in metadata_files:
                artifact_path = metadata_path.with_name(metadata_path.name.replace(".metadata.json", ".joblib"))
                if artifact_path.exists():
                    self.models[kind] = load_verified_bundle(artifact_path, metadata_path)
                    break


sync_active_artifacts()
state = ArtifactState()
app = FastAPI(title="DJIHS Static Model Inference Service", version="1.0.0")


def authorize(authorization: str | None = Header(default=None)) -> None:
    if not SERVICE_TOKEN:
        raise HTTPException(status_code=503, detail="Service token is not configured")
    if authorization != f"Bearer {SERVICE_TOKEN}":
        raise HTTPException(status_code=401, detail="Invalid service token")


def get_model(kind: Literal["pathway", "neet"], expected_version: str) -> tuple[dict[str, Any], dict[str, Any]]:
    loaded = state.models.get(kind)
    if not loaded:
        raise HTTPException(status_code=503, detail={"code": "MODEL_NOT_AVAILABLE", "kind": kind})
    bundle, metadata = loaded
    if bundle.get("version") != expected_version:
        raise HTTPException(status_code=409, detail={"code": "MODEL_VERSION_MISMATCH", "loaded": bundle.get("version"), "expected": expected_version})
    return bundle, metadata


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "service": "available",
        "models": {
            kind: {"state": "MODEL_ACTIVE", "version": bundle[0].get("version")}
            for kind, bundle in state.models.items()
        },
        "missing": [kind for kind in ("pathway", "neet") if kind not in state.models],
    }


@app.post("/predict/pathway", dependencies=[Depends(authorize)])
def predict_pathway(request: PredictionRequest) -> dict[str, Any]:
    bundle, metadata = get_model("pathway", request.expected_model_version)
    return run_pathway(bundle, metadata, request.record)


def run_pathway(bundle: dict[str, Any], metadata: dict[str, Any], record: dict[str, Any]) -> dict[str, Any]:
    frame = record_to_frame(record, bundle["features"])
    transformed = bundle["preprocessor"].transform(frame)
    classes = np.asarray(bundle["classes"])
    probability_parts = []
    for model in bundle["base_models"].values():
        raw = model.predict_proba(transformed)
        aligned = np.zeros((1, len(classes)))
        for source_index, label in enumerate(model.classes_):
            aligned[:, int(np.where(classes == label)[0][0])] = raw[:, source_index]
        probability_parts.append(aligned)
    meta_probabilities = bundle["meta_learner"].predict_proba(np.hstack(probability_parts))[0]
    class_index = int(np.argmax(meta_probabilities))
    predicted_cluster = int(bundle["meta_learner"].classes_[class_index])
    profile = next((item for item in metadata.get("cluster_profiles", []) if item["cluster_id"] == predicted_cluster), None)
    return {
        "kind": "pathway",
        "model_version": bundle["version"],
        "predicted_class": str(predicted_cluster),
        "interpreted_label": profile.get("interpreted_label") if profile else None,
        "probability": float(meta_probabilities[class_index]),
        "class_probabilities": {str(label): float(meta_probabilities[index]) for index, label in enumerate(bundle["meta_learner"].classes_)},
        "factor_associations": None,
    }


@app.post("/predict/neet", dependencies=[Depends(authorize)])
def predict_neet(request: PredictionRequest) -> dict[str, Any]:
    bundle, _ = get_model("neet", request.expected_model_version)
    return run_neet(bundle, request.record)


def run_neet(bundle: dict[str, Any], record: dict[str, Any]) -> dict[str, Any]:
    frame = record_to_frame(record, bundle["features"])
    probability = float(bundle["model"].predict_proba(frame)[0, 1])
    is_neet = probability >= float(bundle["threshold"])
    transformed = bundle["model"].named_steps["preprocess"].transform(frame)[0]
    names = bundle["model"].named_steps["preprocess"].get_feature_names_out()
    coefficients = bundle["model"].named_steps["model"].coef_[0]
    factors = sorted([
        {
            "encoded_feature": str(name),
            "contribution": float(coefficient * feature_value),
            "direction": "higher" if coefficient * feature_value > 0 else "lower",
            "interpretation": "Associated with the model's predicted NEET likelihood; this is not evidence of causation.",
        }
        for name, coefficient, feature_value in zip(names, coefficients, transformed, strict=True)
        if abs(coefficient * feature_value) > 1e-9
    ], key=lambda item: abs(item["contribution"]), reverse=True)[:8]
    return {
        "kind": "neet",
        "model_version": bundle["version"],
        "predicted_class": "NEET" if is_neet else "Non-NEET",
        "probability": probability,
        "class_probabilities": {"Non-NEET": 1.0 - probability, "NEET": probability},
        "threshold": float(bundle["threshold"]),
        "factor_associations": factors,
    }


@app.post("/predict/batch", dependencies=[Depends(authorize)])
def predict_batch(request: BatchPredictionRequest) -> dict[str, Any]:
    """Run both finalized models without changing either individual contract."""
    pathway_bundle, pathway_metadata = get_model(
        "pathway", request.expected_model_versions.pathway
    )
    neet_bundle, _ = get_model("neet", request.expected_model_versions.neet)
    predictions = []
    for item in request.records:
        predictions.append({
            "source_row": item.source_row,
            "pathway": run_pathway(pathway_bundle, pathway_metadata, item.record),
            "neet": run_neet(neet_bundle, item.record),
        })
    return {
        "model_versions": {
            "pathway": pathway_bundle["version"],
            "neet": neet_bundle["version"],
        },
        "predictions": predictions,
    }
