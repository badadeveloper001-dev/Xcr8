import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.caption_adapter import _is_meaningful_rewrite


SOURCE = (
    "I'm launching my handmade skincare line in Lagos this Saturday. "
    "Each batch is made with shea butter and aloe vera for dry skin."
)


def test_rejects_source_caption_with_only_punctuation_changes():
    assert not _is_meaningful_rewrite(SOURCE.replace(".", "!!"), SOURCE)


def test_rejects_rearranged_source_sentences():
    rearranged = (
        "Each batch is made with shea butter and aloe vera for dry skin. "
        "I'm launching my handmade skincare line in Lagos this Saturday."
    )
    assert not _is_meaningful_rewrite(rearranged, SOURCE)


def test_accepts_a_genuine_fact_preserving_rewrite():
    rewritten = (
        "Dry skin needs more than a quick fix. Our handmade skincare line brings "
        "together shea butter and aloe vera, with the Lagos launch happening this Saturday."
    )
    assert _is_meaningful_rewrite(rewritten, SOURCE)
