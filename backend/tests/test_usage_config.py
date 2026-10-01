from app.services.usage_config import (
    CREDIT_WEIGHTS,
    PLAN_USAGE,
    VOICEOVER_MAX_CHARACTERS,
    WARNING_THRESHOLDS,
    IMAGE_MODES,
)


def test_plan_usage_matches_initial_economics():
    assert PLAN_USAGE["free"].monthly_credits == 500
    assert PLAN_USAGE["starter"].monthly_credits == 5_000
    assert PLAN_USAGE["pro"].monthly_credits == 15_000
    assert PLAN_USAGE["business"].monthly_credits == 50_000

    assert PLAN_USAGE["business"].limits.text_generations == 5_000
    assert PLAN_USAGE["business"].limits.standard_images == 200
    assert PLAN_USAGE["business"].limits.hq_images == 20
    assert PLAN_USAGE["business"].limits.voiceovers == 100


def test_credit_weights_are_centralized():
    assert CREDIT_WEIGHTS == {
        "basic_text_generation": 1,
        "advanced_ai_generation": 4,
        "standard_image_generation": 20,
        "hq_image_generation": 80,
        "short_voiceover": 15,
        "ai_content_analysis": 4,
    }


def test_safety_configuration():
    assert VOICEOVER_MAX_CHARACTERS == 500
    assert IMAGE_MODES == ("preview", "standard", "hq")
    assert WARNING_THRESHOLDS == {"warning": 75, "critical": 90, "exhausted": 100}
