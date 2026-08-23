import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.ai_adapter import _local_adapt, _memory_hint


def test_caption_fallback_preserves_source_without_mechanical_language_corruption():
    source = "This business is serious, and this post is about our August launch."
    result = _local_adapt(
        source,
        "threads",
        "nigerian_pidgin",
        {"memory_facts": ["last_master_caption: an unrelated old campaign"]},
    )

    assert result["adapted_caption"] == source
    assert result["hook"] == ""
    assert "thna" not in result["adapted_caption"].lower()
    assert "unrelated old campaign" not in result["adapted_caption"].lower()


def test_caption_memory_ignores_previous_posts_but_keeps_durable_preferences():
    memory = {
        "memory_facts": [
            "last_master_caption: recycle this old post",
            "recent_prompt: another stale request",
            "brand_voice: practical and warm",
        ]
    }

    assert _memory_hint(memory) == "brand_voice: practical and warm"


def test_caption_fallback_does_not_add_xcr8_promotional_hashtags():
    result = _local_adapt(
        "Launching our handmade skincare collection in Lagos this Saturday.",
        "instagram",
        "english",
        {},
    )

    assert "#xcr8" not in result["hashtags"]
    assert "#creatoros" not in result["hashtags"]
