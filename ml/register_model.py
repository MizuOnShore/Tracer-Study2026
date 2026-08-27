from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client


def main() -> None:
    parser = argparse.ArgumentParser(description="Upload an evaluated static model and register its evidence.")
    parser.add_argument("metadata", type=Path)
    parser.add_argument("--activate", action="store_true", help="Explicitly retire the current version and activate this one")
    args = parser.parse_args()
    load_dotenv()
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    client = create_client(url, key)
    metadata = json.loads(args.metadata.read_text(encoding="utf-8"))
    artifact = args.metadata.with_name(metadata["artifact_file"])
    kind = metadata["kind"]
    version = metadata["version"]
    prefix = f"{kind}/{version}"
    artifact_path = f"{prefix}/{artifact.name}"
    metadata_path = f"{prefix}/{args.metadata.name}"
    client.storage.from_("model-artifacts").upload(artifact_path, artifact.read_bytes(), {"content-type": "application/octet-stream", "upsert": "false"})
    client.storage.from_("model-artifacts").upload(metadata_path, args.metadata.read_bytes(), {"content-type": "application/json", "upsert": "false"})
    registry = client.table("model_registry").insert({
        "kind": kind,
        "version": version,
        "status": "evaluated",
        "artifact_path": artifact_path,
        "preprocessing_path": artifact_path,
        "metadata_path": metadata_path,
        "sha256": metadata["artifact_sha256"],
        "feature_schema_version": metadata["feature_schema_version"],
        "training_data_hash": metadata["training_data_hash"],
        "training_record_count": metadata["training_record_count"],
    }).execute().data[0]
    model_id = registry["id"]
    for split_name, metrics in metadata["evaluation"].items():
        for metric_name in ("accuracy", "precision_macro", "recall_macro", "f1_macro", "precision_weighted", "recall_weighted", "f1_weighted", "neet_recall"):
            if metric_name in metrics:
                client.table("model_metrics").insert({"model_id": model_id, "split_name": split_name, "metric_name": metric_name, "metric_value": metrics[metric_name]}).execute()
        client.table("model_metrics").insert({"model_id": model_id, "split_name": split_name, "metric_name": "confusion_matrix", "matrix": {"labels": metrics["confusion_matrix_labels"], "values": metrics["confusion_matrix"]}}).execute()
    for profile in metadata.get("cluster_profiles", []):
        client.table("cluster_profiles").insert({"model_id": model_id, "cluster_id": profile["cluster_id"], "interpreted_label": None, "profile": profile}).execute()
    if args.activate:
        client.rpc("activate_model", {"target_model_id": model_id}).execute()
    print(json.dumps({"model_id": model_id, "kind": kind, "version": version, "status": "active" if args.activate else "evaluated"}, indent=2))


if __name__ == "__main__":
    main()
