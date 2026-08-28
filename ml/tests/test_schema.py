import pandas as pd
import pytest
from pydantic import ValidationError

import service
from service import BatchPredictionRequest
from tracer_ml.schema import construct_neet_target


def test_neet_target_uses_direct_engagement_status() -> None:
    frame = pd.DataFrame({"current_status": ["employed", "higher_education", "self_employed", "training", "neet"]})
    assert construct_neet_target(frame).tolist() == [0, 0, 0, 0, 1]


def test_neet_target_rejects_ambiguous_status() -> None:
    with pytest.raises(ValueError, match="Unknown current_status"):
        construct_neet_target(pd.DataFrame({"current_status": ["unemployed"]}))


def test_batch_request_requires_both_model_versions() -> None:
    with pytest.raises(ValidationError):
        BatchPredictionRequest.model_validate({
            "expected_model_versions": {"pathway": "v1"},
            "records": [{"source_row": 2, "record": {}}],
        })


def test_batch_request_rejects_header_row_as_data() -> None:
    with pytest.raises(ValidationError):
        BatchPredictionRequest.model_validate({
            "expected_model_versions": {"pathway": "v1", "neet": "v1"},
            "records": [{"source_row": 1, "record": {}}],
        })


def test_batch_adapter_preserves_source_rows_and_versions(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_get_model(kind: str, expected: str):
        return ({"version": expected, "kind": kind}, {"profiles": []})

    monkeypatch.setattr(service, "get_model", fake_get_model)
    monkeypatch.setattr(service, "run_pathway", lambda bundle, metadata, record: {"kind": "pathway", "value": record["marker"]})
    monkeypatch.setattr(service, "run_neet", lambda bundle, record: {"kind": "neet", "value": record["marker"]})
    request = BatchPredictionRequest.model_validate({
        "expected_model_versions": {"pathway": "path-v1", "neet": "neet-v2"},
        "records": [{"source_row": 7, "record": {"marker": "kept"}}],
    })
    result = service.predict_batch(request)
    assert result["model_versions"] == {"pathway": "path-v1", "neet": "neet-v2"}
    assert result["predictions"] == [{
        "source_row": 7,
        "pathway": {"kind": "pathway", "value": "kept"},
        "neet": {"kind": "neet", "value": "kept"},
    }]
