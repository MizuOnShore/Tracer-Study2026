import pandas as pd
import pytest

from tracer_ml.schema import construct_neet_target


def test_neet_target_uses_direct_engagement_status() -> None:
    frame = pd.DataFrame({"current_status": ["employed", "higher_education", "self_employed", "training", "neet"]})
    assert construct_neet_target(frame).tolist() == [0, 0, 0, 0, 1]


def test_neet_target_rejects_ambiguous_status() -> None:
    with pytest.raises(ValueError, match="Unknown current_status"):
        construct_neet_target(pd.DataFrame({"current_status": ["unemployed"]}))
