"""Central configuration for Xcr8 usage entitlements and credit economics.

Keep product entitlements and economic weights here so changing plan economics does
not require changing generation/provider logic.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final


@dataclass(frozen=True, slots=True)
class FeatureLimit:
    text_generations: int
    standard_images: int
    hq_images: int
    voiceovers: int


@dataclass(frozen=True, slots=True)
class PlanUsageConfig:
    monthly_credits: int
    limits: FeatureLimit


PLAN_USAGE: Final[dict[str, PlanUsageConfig]] = {
    "free": PlanUsageConfig(
        monthly_credits=500,
        limits=FeatureLimit(text_generations=50, standard_images=0, hq_images=0, voiceovers=0),
    ),
    "starter": PlanUsageConfig(
        monthly_credits=5_000,
        limits=FeatureLimit(text_generations=500, standard_images=25, hq_images=0, voiceovers=10),
    ),
    "pro": PlanUsageConfig(
        monthly_credits=15_000,
        limits=FeatureLimit(text_generations=2_500, standard_images=100, hq_images=10, voiceovers=50),
    ),
    "business": PlanUsageConfig(
        monthly_credits=50_000,
        limits=FeatureLimit(text_generations=5_000, standard_images=200, hq_images=20, voiceovers=100),
    ),
}


CREDIT_WEIGHTS: Final[dict[str, int]] = {
    "basic_text_generation": 1,
    "advanced_ai_generation": 4,
    "standard_image_generation": 20,
    "hq_image_generation": 80,
    "short_voiceover": 15,
    "ai_content_analysis": 4,
}


WARNING_THRESHOLDS: Final[dict[str, int]] = {
    "warning": 75,
    "critical": 90,
    "exhausted": 100,
}


VOICEOVER_MAX_CHARACTERS: Final[int] = 500


IMAGE_MODES: Final[tuple[str, ...]] = ("preview", "standard", "hq")


def plan_usage(plan_id: str) -> PlanUsageConfig:
    """Return the authoritative usage configuration for a normalized plan."""
    try:
        return PLAN_USAGE[str(plan_id).strip().lower()]
    except KeyError as exc:
        raise ValueError(f"Unsupported Xcr8 plan: {plan_id}") from exc


def credit_weight(feature: str) -> int:
    """Return the configured credit weight for a billable feature."""
    try:
        return CREDIT_WEIGHTS[str(feature).strip().lower()]
    except KeyError as exc:
        raise ValueError(f"Unsupported billable feature: {feature}") from exc
