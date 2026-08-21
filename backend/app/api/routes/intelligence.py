from __future__ import annotations

from datetime import UTC, datetime
from xml.etree import ElementTree

import httpx

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.db.models import (
    AnalyticsSnapshot,
    ContentPost,
    CreatorProfile,
    IntelligenceFeedback,
    IntelligenceNotification,
    TrendRecommendation,
    TrendResearchBrief,
    TrendSignalEvent,
    User,
)
from app.schemas.mvp import (
    IntelligenceFeedbackRequest,
    IntelligenceFeedResponse,
    IntelligenceNotificationItem,
    IntelligenceNotificationReadRequest,
    IntelligenceRecommendation,
    IntelligenceRefreshRequest,
    IntelligenceResearchBrief,
    IntelligenceSignal,
)

router = APIRouter(prefix="/intelligence", tags=["intelligence"])


def _as_iso(value: datetime | None) -> str:
    return (value or datetime.now(tz=UTC)).isoformat()


def _profile_interests(profile: CreatorProfile | None) -> list[str]:
    if not profile:
        return ["creator growth", "content strategy"]

    preferences = profile.preferences if isinstance(profile.preferences, dict) else {}
    explicit = preferences.get("content_niche")
    if isinstance(explicit, list) and explicit:
        cleaned = [str(item).strip().lower() for item in explicit if str(item).strip()]
        if cleaned:
            return cleaned[:6]

    niche = str(profile.niche or "creator growth").strip().lower()
    if not niche:
        niche = "creator growth"
    return [niche, "creator economy"]


def _safe_platform(value: str | None) -> str:
    cleaned = str(value or "all").strip().lower()
    return cleaned or "all"


def _build_signal_payload(topic: str, platform: str, momentum_boost: float) -> dict:
    momentum = min(0.95, 0.45 + momentum_boost)
    relevance = min(0.95, 0.52 + momentum_boost / 2)
    opportunity = min(0.95, 0.58 + momentum_boost / 2)

    return {
        "title": f"{topic.title()} is gaining creator momentum",
        "summary": (
            f"Conversations and content patterns around {topic} are increasing. "
            f"Early creators are packaging this as practical stories and short explainers."
        ),
        "momentum_score": round(momentum, 2),
        "relevance_score": round(relevance, 2),
        "opportunity_score": round(opportunity, 2),
        "risk_score": 0.24,
        "confidence_score": round((momentum + relevance + opportunity) / 3, 2),
        "platform": platform,
    }


def _materialize_signal(db: Session, user_id: int, topic: str, platform: str, momentum_boost: float) -> TrendSignalEvent | None:
    payload = _build_signal_payload(topic, platform, momentum_boost)

    existing_titles = {
        item.title
        for item in db.scalars(
            select(TrendSignalEvent)
            .where(TrendSignalEvent.user_id == user_id)
            .order_by(desc(TrendSignalEvent.created_at))
            .limit(50)
        )
    }
    if payload["title"] in existing_titles:
        return None

    signal = TrendSignalEvent(
        user_id=user_id,
        topic=topic,
        platform=payload["platform"],
        title=payload["title"],
        summary=payload["summary"],
        source_label="xcr8-offline-intelligence",
        confidence_score=payload["confidence_score"],
        momentum_score=payload["momentum_score"],
        relevance_score=payload["relevance_score"],
        opportunity_score=payload["opportunity_score"],
        risk_score=payload["risk_score"],
        status="new",
        signal_meta={"mode": "offline-mvp"},
    )
    db.add(signal)
    db.flush()

    brief = TrendResearchBrief(
        trend_signal_id=signal.id,
        what_is_happening=f"More creators are experimenting with {topic} narratives and repeatable formats.",
        why_it_matters="Early adoption improves discoverability before formats saturate.",
        who_is_using_it="Education creators, startup builders, and niche experts with story-led positioning.",
        why_it_performs="It combines useful specificity with personal context and strong hooks.",
        potential_risks="Overused hooks and shallow takes can reduce trust if copied blindly.",
        opportunities="Localize the angle, show real process, and add audience participation CTA.",
    )
    db.add(brief)

    recommendation = TrendRecommendation(
        trend_signal_id=signal.id,
        recommendation_type="content_angle",
        content_angle=f"Show your real workflow for {topic} using one specific challenge and one result.",
        story_framework="Context -> friction -> decision -> build steps -> result -> CTA",
        brainstorm_seed=f"Generate 6 content angles around {topic} for creator growth.",
        composer_seed=f"Write a high-retention post about {topic} with a bold hook and practical CTA.",
        score=signal.opportunity_score,
    )
    db.add(recommendation)

    notification = IntelligenceNotification(
        user_id=user_id,
        title=f"New trend detected: {topic.title()}",
        body=f"{topic.title()} is accelerating. Tap to map it to your niche and create content.",
        severity="info",
        related_topic=topic,
        is_read=False,
    )
    db.add(notification)

    return signal


def _fetch_live_google_trends() -> list[dict[str, str]]:
    """Read Google's public trending-searches RSS feed; never manufacture a trend on failure."""
    try:
        with httpx.Client(timeout=8.0, follow_redirects=True) as client:
            response = client.get("https://trends.google.com/trending/rss?geo=NG")
        if response.status_code >= 400:
            return []
        root = ElementTree.fromstring(response.content)
        entries: list[dict[str, str]] = []
        for item in root.findall(".//item")[:30]:
            title = str(item.findtext("title") or "").strip()
            published = str(item.findtext("pubDate") or "").strip()
            traffic = ""
            for child in list(item):
                if child.tag.endswith("approx_traffic"):
                    traffic = str(child.text or "").strip()
                    break
            if title:
                entries.append({"topic": title, "published_at": published, "traffic": traffic})
        return entries
    except Exception:
        return []


def _refresh_live_signals(db: Session, user: User, interests: list[str], platform: str) -> int:
    live_trends = _fetch_live_google_trends()
    if not live_trends:
        return 0

    interest_terms = " ".join(interests).lower()
    ranked = sorted(
        live_trends,
        key=lambda item: (
            0 if any(token and token in item["topic"].lower() for token in interest_terms.split()) else 1,
            item["topic"].lower(),
        ),
    )[:8]

    existing_topics = {
        item.topic.lower()
        for item in db.scalars(
            select(TrendSignalEvent)
            .where(TrendSignalEvent.user_id == user.id)
            .order_by(desc(TrendSignalEvent.created_at))
            .limit(80)
        )
    }

    created = 0
    for item in ranked:
        topic = item["topic"]
        if topic.lower() in existing_topics:
            continue
        traffic_note = f" with {item['traffic']} searches" if item["traffic"] else ""
        signal = TrendSignalEvent(
            user_id=user.id,
            topic=topic,
            platform=platform,
            title=f"{topic} is trending now",
            summary=(
                f"Live Google Trends signal{traffic_note}."
                "Check the source and map only a genuinely relevant angle to your audience."
            ),
            source_label="Google Trends (live)",
            confidence_score=0.72,
            momentum_score=0.70,
            relevance_score=0.78 if any(token and token in topic.lower() for token in interest_terms.split()) else 0.45,
            opportunity_score=0.66,
            risk_score=0.35,
            status="new",
            signal_meta={
                "mode": "live-google-trends",
                "source_url": "https://trends.google.com/trending/rss?geo=NG",
                "source_published_at": item["published_at"],
                "fetched_at": _as_iso(None),
            },
        )
        db.add(signal)
        db.flush()
        db.add(TrendResearchBrief(
            trend_signal_id=signal.id,
            what_is_happening=f"{topic} is appearing in Google's current Nigeria trending-search feed.",
            why_it_matters="It is a real current-interest signal, not a prediction of performance for every creator.",
            who_is_using_it="Audience interest is broad; evaluate fit against your niche before posting.",
            why_it_performs="Timely, useful, original context can earn attention when it genuinely serves your audience.",
            potential_risks="Newsjacking or forcing an unrelated topic can damage audience trust.",
            opportunities=f"Use a niche-relevant angle on {topic}, cite the source, and publish only if you have a useful point of view.",
        ))
        db.add(TrendRecommendation(
            trend_signal_id=signal.id,
            recommendation_type="content_angle",
            content_angle=f"Add your expert perspective to {topic}; do not repeat the headline.",
            story_framework="Current signal -> your audience context -> useful interpretation -> one practical action",
            brainstorm_seed=f"Find a niche-relevant, responsible content angle around {topic}.",
            composer_seed=f"Write a concise, source-aware post about {topic} for {platform}.",
            score=signal.opportunity_score,
        ))
        created += 1

    db.commit()
    return created

def _serialize_signal(signal: TrendSignalEvent, brief: TrendResearchBrief | None, recs: list[TrendRecommendation]) -> IntelligenceSignal:
    brief_payload = IntelligenceResearchBrief(
        what_is_happening=brief.what_is_happening if brief else "Signal detected from local creator data.",
        why_it_matters=brief.why_it_matters if brief else "It can improve reach when acted on early.",
        who_is_using_it=brief.who_is_using_it if brief else "Creators in adjacent niches.",
        why_it_performs=brief.why_it_performs if brief else "It pairs relevance with practical value.",
        potential_risks=brief.potential_risks if brief else "Low quality copycats can saturate the pattern.",
        opportunities=brief.opportunities if brief else "Localize and execute with your brand voice.",
    )

    recommendations = [
        IntelligenceRecommendation(
            recommendation_type=item.recommendation_type,
            content_angle=item.content_angle,
            story_framework=item.story_framework,
            brainstorm_seed=item.brainstorm_seed,
            composer_seed=item.composer_seed,
            score=item.score,
        )
        for item in recs
    ]

    return IntelligenceSignal(
        id=signal.id,
        topic=signal.topic,
        platform=signal.platform,
        title=signal.title,
        summary=signal.summary,
        source_label=signal.source_label,
        confidence_score=signal.confidence_score,
        momentum_score=signal.momentum_score,
        relevance_score=signal.relevance_score,
        opportunity_score=signal.opportunity_score,
        risk_score=signal.risk_score,
        status=signal.status,
        created_at=_as_iso(signal.created_at),
        brief=brief_payload,
        recommendations=recommendations,
    )


@router.post("/refresh")
def refresh_intelligence(payload: IntelligenceRefreshRequest, db: Session = Depends(get_db)) -> dict:
    user = db.get(User, payload.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    profile = db.scalar(select(CreatorProfile).where(CreatorProfile.user_id == user.id))
    interests = payload.interests or _profile_interests(profile)
    created = _refresh_live_signals(db, user, interests, _safe_platform(payload.platform))
    return {
        "created": created,
        "interests": interests,
        "generated_at": _as_iso(None),
    }


@router.get("/feed/{user_id}", response_model=IntelligenceFeedResponse)
def intelligence_feed(
    user_id: int,
    platform: str = Query(default="all"),
    limit: int = Query(default=12, ge=3, le=50),
    db: Session = Depends(get_db),
) -> IntelligenceFeedResponse:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    profile = db.scalar(select(CreatorProfile).where(CreatorProfile.user_id == user_id))
    interests = _profile_interests(profile)
    platform_filter = _safe_platform(platform)

    signal_query = select(TrendSignalEvent).where(TrendSignalEvent.user_id == user_id)
    if platform_filter != "all":
        signal_query = signal_query.where(TrendSignalEvent.platform == platform_filter)

    signals = list(db.scalars(signal_query.order_by(desc(TrendSignalEvent.created_at)).limit(limit)))
    if len(signals) < 3:
        _refresh_live_signals(db, user, interests, platform_filter)
        signals = list(db.scalars(signal_query.order_by(desc(TrendSignalEvent.created_at)).limit(limit)))

    signal_ids = [item.id for item in signals]
    briefs = list(
        db.scalars(
            select(TrendResearchBrief)
            .where(TrendResearchBrief.trend_signal_id.in_(signal_ids if signal_ids else [-1]))
            .order_by(desc(TrendResearchBrief.created_at))
        )
    )
    recommendations = list(
        db.scalars(
            select(TrendRecommendation)
            .where(TrendRecommendation.trend_signal_id.in_(signal_ids if signal_ids else [-1]))
            .order_by(desc(TrendRecommendation.created_at))
        )
    )

    brief_by_signal: dict[int, TrendResearchBrief] = {}
    for item in briefs:
        brief_by_signal.setdefault(item.trend_signal_id, item)

    rec_by_signal: dict[int, list[TrendRecommendation]] = {}
    for item in recommendations:
        rec_by_signal.setdefault(item.trend_signal_id, []).append(item)

    notifications = list(
        db.scalars(
            select(IntelligenceNotification)
            .where(IntelligenceNotification.user_id == user_id)
            .order_by(desc(IntelligenceNotification.created_at))
            .limit(12)
        )
    )

    notification_items = [
        IntelligenceNotificationItem(
            id=item.id,
            title=item.title,
            body=item.body,
            severity=item.severity,
            related_topic=item.related_topic,
            is_read=item.is_read,
            created_at=_as_iso(item.created_at),
        )
        for item in notifications
    ]

    serialized = [
        _serialize_signal(signal, brief_by_signal.get(signal.id), rec_by_signal.get(signal.id, []))
        for signal in signals
    ]

    return IntelligenceFeedResponse(
        user_id=user_id,
        generated_at=_as_iso(None),
        summary="Cr8or Intelligence shows sourced live trend signals when the live source is available. It does not invent trends.",
        interests=interests,
        signals=serialized,
        notifications=notification_items,
        source_stats={
            "signals": len(serialized),
            "notifications": len(notification_items),
            "mode": "live-google-trends",
        },
    )


@router.post("/notifications/{notification_id}/read", response_model=IntelligenceNotificationItem)
def mark_notification_read(
    notification_id: int,
    payload: IntelligenceNotificationReadRequest,
    db: Session = Depends(get_db),
) -> IntelligenceNotificationItem:
    notification = db.scalar(
        select(IntelligenceNotification).where(
            IntelligenceNotification.id == notification_id,
            IntelligenceNotification.user_id == payload.user_id,
        )
    )
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    notification.is_read = True
    db.add(notification)
    db.commit()
    db.refresh(notification)

    return IntelligenceNotificationItem(
        id=notification.id,
        title=notification.title,
        body=notification.body,
        severity=notification.severity,
        related_topic=notification.related_topic,
        is_read=notification.is_read,
        created_at=_as_iso(notification.created_at),
    )


@router.post("/feedback")
def submit_intelligence_feedback(payload: IntelligenceFeedbackRequest, db: Session = Depends(get_db)) -> dict:
    user = db.get(User, payload.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    signal = db.get(TrendSignalEvent, payload.trend_signal_id)
    if not signal or signal.user_id != payload.user_id:
        raise HTTPException(status_code=404, detail="Trend signal not found")

    action_weight = {
        "viewed": 0.2,
        "saved": 0.8,
        "dismissed": -0.6,
        "brainstormed": 0.9,
        "composed": 1.0,
        "published": 1.4,
    }.get(payload.action, 0.2)

    feedback = IntelligenceFeedback(
        user_id=payload.user_id,
        trend_signal_id=payload.trend_signal_id,
        action=payload.action,
        weight=action_weight,
    )
    db.add(feedback)

    if payload.action in {"saved", "brainstormed", "composed", "published"}:
        signal.status = "saved"
    elif payload.action == "dismissed":
        signal.status = "dismissed"

    db.add(signal)
    db.commit()

    return {
        "trend_signal_id": signal.id,
        "action": payload.action,
        "status": signal.status,
    }
