from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import joblib


def save_bundle(bundle: dict[str, Any], metadata: dict[str, Any], output_dir: Path, name: str) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = output_dir / f"{name}.joblib"
    metadata_path = output_dir / f"{name}.metadata.json"
    joblib.dump(bundle, artifact_path, compress=3)
    digest = hashlib.sha256(artifact_path.read_bytes()).hexdigest()
    metadata = {**metadata, "artifact_sha256": digest, "artifact_file": artifact_path.name}
    metadata_path.write_text(json.dumps(metadata, indent=2, sort_keys=True), encoding="utf-8")
    return {"artifact": str(artifact_path), "metadata": str(metadata_path), "sha256": digest}


def load_verified_bundle(artifact_path: Path, metadata_path: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    actual = hashlib.sha256(artifact_path.read_bytes()).hexdigest()
    if actual != metadata.get("artifact_sha256"):
        raise RuntimeError(f"Artifact checksum mismatch for {artifact_path.name}")
    return joblib.load(artifact_path), metadata
