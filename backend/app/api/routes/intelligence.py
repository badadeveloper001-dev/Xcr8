from __future__ import annotations

from datetime import UTC, datetime, timedelta
import re
from urllib.parse import quote_plus
from xml.etree import ElementTree

import httpx

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func, or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.deps import get_db
from app.db.models import (
    AnalyticsSnapshot,
    ConnectedPlatform,
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


_SHORT_NICHE_TOKENS = {"ai", "ar", "vr", "ui", "ux", "hr"}

_NICHE_STOPWORDS = {
    "and", "the", "for", "with", "from", "into", "your", "content", "creator",
    "creators", "creation", "social", "media", "online", "digital", "general",
}


def _clean_niches(values: object) -> list[str]:
    if isinstance(values, str):
        candidates = [values]
    elif isinstance(values, list):
        candidates = [str(item) for item in values]
    else:
        candidates = []

    cleaned: list[str] = []
    for candidate in candidates:
        niche = re.sub(r"\s+", " ", candidate.strip().lower())
        if len(niche) < 2 or niche in cleaned:
            continue
        cleaned.append(niche)
    return cleaned[:6]


def _profile_interests(profile: CreatorProfile | None) -> list[str]:
    """Return only niches the user explicitly selected or saved."""
    if not profile:
        return []

    preferences = profile.preferences if isinstance(profile.preferences, dict) else {}
    niches = _clean_niches(preferences.get("content_niche"))
    saved_niche = _clean_niches(profile.niche)
    for niche in saved_niche:
        if niche not in niches:
            niches.append(niche)
    return niches[:6]


def _niche_tokens(interests: list[str]) -> set[str]:
    tokens: set[str] = set()
    for interest in interests:
        for token in re.findall(r"[a-z0-9]+", interest.lower()):
            if (len(token) >= 3 or token in _SHORT_NICHE_TOKENS) and token not in _NICHE_STOPWORDS:
                tokens.add(token)
    return tokens


def _matches_niche(text: str, interests: list[str]) -> bool:
    normalized = re.sub(r"[^a-z0-9]+", " ", str(text or "").lower()).strip()
    if not normalized or not interests:
        return False

    for interest in interests:
        phrase = re.sub(r"[^a-z0-9]+", " ", interest.lower()).strip()
        if phrase and phrase in normalized:
            return True

    words = set(normalized.split())
    return bool(words.intersection(_niche_tokens(interests)))


def _matched_niche(text: str, interests: list[str]) -> str:
    for interest in interests:
        if _matches_niche(text, [interest]):
            return interest
    return ""

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
    """Read Google's public trending-searches RSS feed."""
    source_url = "https://trends.google.com/trending/rss?geo=NG"
    try:
        with httpx.Client(timeout=8.0, follow_redirects=True) as client:
            response = client.get(source_url)
        if response.status_code >= 400:
            return []
        root = ElementTree.fromstring(response.content)
        entries: list[dict[str, str]] = []
        for item in root.findall(".//item")[:40]:
            title = str(item.findtext("title") or "").strip()
            published = str(item.findtext("pubDate") or "").strip()
            description = str(item.findtext("description") or "").strip()
            traffic = ""
            for child in list(item):
                if child.tag.endswith("approx_traffic"):
                    traffic = str(child.text or "").strip()
                    break
            if title:
                entries.append(
                    {
                        "topic": title,
                        "description": description,
                        "published_at": published,
                        "traffic": traffic,
                        "source_label": "Google Trends (live)",
                        "source_url": source_url,
                        "matched_niche": "",
                    }
                )
        return entries
    except Exception:
        return []


def _fetch_live_niche_news(interests: list[str]) -> list[dict[str, str]]:
    """Fetch current stories for the user's niches instead of unrelated headlines."""
    entries: list[dict[str, str]] = []
    try:
        with httpx.Client(timeout=8.0, follow_redirects=True) as client:
            for niche in interests[:3]:
                query = quote_plus(f'"{niche}" when:7d')
                source_url = (
                    f"https://news.google.com/rss/search?q={query}"
                    "&hl=en-NG&gl=NG&ceid=NG:en"
                )
                response = client.get(source_url)
                if response.status_code >= 400:
                    continue
                root = ElementTree.fromstring(response.content)
                for item in root.findall(".//item")[:12]:
                    title = str(item.findtext("title") or "").strip()
                    description = str(item.findtext("description") or "").strip()
                    published = str(item.findtext("pubDate") or "").strip()
                    link = str(item.findtext("link") or "").strip()
                    searchable = f"{title} {description}"
                    if not title or not _matches_niche(searchable, [niche]):
                        continue
                    entries.append(
                        {
                            "topic": title,
                            "description": description,
                            "published_at": published,
                            "traffic": "",
                            "source_label": "Google News (live niche search)",
                            "source_url": link or source_url,
                            "matched_niche": niche,
                        }
                    )
    except Exception:
        return entries
    return entries


def _youtube_candidates_from_payload(payload: object, niche: str) -> list[dict[str, str]]:
    """Convert YouTube search results into safe, niche-labelled trend candidates."""
    if not isinstance(payload, dict) or not isinstance(payload.get("items"), list):
        return []
    entries: list[dict[str, str]] = []
    source_url = "https://www.youtube.com/results?search_query=" + quote_plus(niche)
    for item in payload["items"][:10]:
        if not isinstance(item, dict):
            continue
        video_id = item.get("id", {}).get("videoId") if isinstance(item.get("id"), dict) else ""
        snippet = item.get("snippet") if isinstance(item.get("snippet"), dict) else {}
        title = str(snippet.get("title") or "").strip()
        description = str(snippet.get("description") or "").strip()
        published = str(snippet.get("publishedAt") or "").strip()
        if not video_id or not title or not _matches_niche(f"{title} {description}", [niche]):
            continue
        entries.append({
            "topic": title,
            "description": description,
            "published_at": published,
            "traffic": "",
            "source_label": "YouTube niche discovery (recent, view-ranked)",
            "source_url": f"https://www.youtube.com/watch?v={video_id}",
            "matched_niche": niche,
        })
    return entries


def _threads_candidates_from_payload(payload: object, niche: str) -> list[dict[str, str]]:
    """Convert authenticated Threads keyword results into safe trend candidates."""
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        return []
    entries: list[dict[str, str]] = []
    for item in payload["data"][:10]:
        if not isinstance(item, dict):
            continue
        text = str(item.get("text") or item.get("title") or "").strip()
        if not text or not _matches_niche(text, [niche]):
            continue
        entries.append({
            "topic": text[:180],
            "description": text,
            "published_at": str(item.get("timestamp") or "").strip(),
            "traffic": "",
            "source_label": "Threads keyword discovery (live)",
            "source_url": str(item.get("permalink") or item.get("url") or "https://www.threads.net/").strip(),
            "matched_niche": niche,
        })
    return entries


def _fetch_live_youtube_trends(interests: list[str]) -> list[dict[str, str]]:
    """Use YouTube's recent, view-ranked search results as niche discovery signals."""
    api_key = str(
        getattr(settings, "youtube_api_key", "")
        or getattr(settings, "google_api_key", "")
        or getattr(settings, "youtube_data_api_key", "")
    ).strip()
    if not api_key:
        return []
    entries: list[dict[str, str]] = []
    published_after = (datetime.now(tz=UTC) - timedelta(days=7)).isoformat().replace("+00:00", "Z")
    try:
        with httpx.Client(timeout=8.0, follow_redirects=True) as client:
            for niche in interests[:3]:
                response = client.get(
                    "https://www.googleapis.com/youtube/v3/search",
                    params={
                        "part": "snippet", "q": niche, "type": "video", "order": "viewCount",
                        "publishedAfter": published_after, "regionCode": "NG",
                        "relevanceLanguage": "en", "maxResults": 10, "key": api_key,
                    },
                )
                if response.status_code >= 400:
                    continue
                entries.extend(_youtube_candidates_from_payload(response.json(), niche))
    except Exception:
        return entries
    return entries


def _fetch_live_threads_trends(db: Session, user: User, interests: list[str]) -> list[dict[str, str]]:
    """Use a connected Threads account for authenticated, niche keyword discovery."""
    token = ""
    for connection in db.scalars(
        select(ConnectedPlatform)
        .where(
            ConnectedPlatform.user_id == user.id,
            ConnectedPlatform.is_active.is_(True),
            ConnectedPlatform.platform == "threads",
        )
        .order_by(desc(ConnectedPlatform.created_at))
    ):
        auth = connection.auth_meta if isinstance(connection.auth_meta, dict) else {}
        token = str(auth.get("access_token") or "").strip()
        if token:
            break
    if not token:
        return []
    entries: list[dict[str, str]] = []
    try:
        with httpx.Client(timeout=8.0, follow_redirects=True) as client:
            for niche in interests[:3]:
                response = client.get(
                    "https://graph.threads.net/v1.0/keyword_search",
                    params={
                        "q": niche, "search_type": "TOP", "search_mode": "KEYWORD",
                        "fields": "id,text,permalink,username,timestamp", "limit": 10,
                        "access_token": token,
                    },
                )
                if response.status_code >= 400:
                    continue
                entries.extend(_threads_candidates_from_payload(response.json(), niche))
    except Exception:
        return entries
    return entries


def _live_niche_candidates(db: Session, user: User, interests: list[str]) -> list[dict[str, str]]:
    candidates: list[dict[str, str]] = []
    for item in _fetch_live_google_trends():
        searchable = f"{item.get('topic', '')} {item.get('description', '')}"
        niche = _matched_niche(searchable, interests)
        if not niche:
            continue
        candidates.append({**item, "matched_niche": niche})

    candidates.extend(_fetch_live_niche_news(interests))
    candidates.extend(_fetch_live_youtube_trends(interests))
    candidates.extend(_fetch_live_threads_trends(db, user, interests))

    deduped: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in candidates:
        key = re.sub(r"[^a-z0-9]+", " ", item["topic"].lower()).strip()
        if not key or key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    # Keep the compact dashboard useful by guaranteeing source diversity.
    selected: list[dict[str, str]] = []
    for prefix in ("YouTube", "Threads", "Google News", "Google Trends"):
        selected.extend(item for item in deduped if item["source_label"].startswith(prefix) and item not in selected[:])
        if len(selected) >= 12:
            break
    for item in deduped:
        if item not in selected:
            selected.append(item)
        if len(selected) >= 12:
            break
    return selected[:12]


def _signal_matches_interests(signal: TrendSignalEvent, interests: list[str]) -> bool:
    if not interests:
        return False
    meta = signal.signal_meta if isinstance(signal.signal_meta, dict) else {}
    matched = str(meta.get("matched_niche") or "").strip().lower()
    if matched and matched in interests:
        return True
    return _matches_niche(
        f"{signal.topic} {signal.title} {signal.summary}",
        interests,
    )


def _refresh_live_signals(db: Session, user: User, interests: list[str], platform: str) -> int:
    if not interests:
        return 0

    live_trends = _live_niche_candidates(db, user, interests)
    if not live_trends:
        return 0

    existing_topics = {
        item.topic.lower()
        for item in db.scalars(
            select(TrendSignalEvent)
            .where(TrendSignalEvent.user_id == user.id)
            .order_by(desc(TrendSignalEvent.created_at))
            .limit(120)
        )
    }

    created = 0
    for item in live_trends[:8]:
        topic = item["topic"]
        if topic.lower() in existing_topics:
            continue
        matched_niche = item["matched_niche"]
        traffic_note = f" with {item['traffic']} searches" if item["traffic"] else ""
        source_label = item["source_label"]
        signal = TrendSignalEvent(
            user_id=user.id,
            topic=topic,
            platform=platform,
            title=f"{topic} — relevant to {matched_niche}",
            summary=(
                f"Current {source_label} signal{traffic_note}, selected because it matches "
                f"your {matched_niche} niche."
            ),
            source_label=source_label,
            confidence_score=0.76,
            momentum_score=0.70,
            relevance_score=0.90,
            opportunity_score=0.72,
            risk_score=0.30,
            status="new",
            signal_meta={
                "mode": "live-niche-intelligence",
                "matched_niche": matched_niche,
                "source_url": item["source_url"],
                "source_published_at": item["published_at"],
                "source_description": re.sub(r"<[^>]+>", "", str(item.get("description") or ""))[:600],
                "fetched_at": _as_iso(None),
            },
        )
        db.add(signal)
        db.flush()
        db.add(
            TrendResearchBrief(
                trend_signal_id=signal.id,
                what_is_happening=f"{topic} is receiving current attention in live sources.",
                why_it_matters=f"It directly overlaps with the user's {matched_niche} niche.",
                who_is_using_it=f"People currently publishing or searching within {matched_niche}.",
                why_it_performs="Timely, useful interpretation can earn attention when it serves the established audience.",
                potential_risks="Copying a headline without original expertise can reduce audience trust.",
                opportunities=f"Explain what {topic} means specifically for a {matched_niche} audience.",
            )
        )
        db.add(
            TrendRecommendation(
                trend_signal_id=signal.id,
                recommendation_type="content_angle",
                content_angle=f"Give a practical {matched_niche} perspective on {topic}.",
                story_framework="Live signal -> niche context -> original insight -> practical action",
                brainstorm_seed=f"Create niche-specific content angles about {topic} for a {matched_niche} audience.",
                composer_seed=f"Write a concise, source-aware {matched_niche} post about {topic} for {platform}.",
                score=signal.opportunity_score,
            )
        )
        db.add(
            IntelligenceNotification(
                user_id=user.id,
                title=f"New {matched_niche} trend",
                body=f"{topic} matches your niche and is receiving current attention.",
                severity="info",
                related_topic=topic,
                is_read=False,
            )
        )
        existing_topics.add(topic.lower())
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
    # Refresh is always anchored to the saved creator niche. Client-supplied
    # interests cannot inject unrelated dashboard trends.
    interests = _profile_interests(profile)
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

    def load_matching_signals() -> list[TrendSignalEvent]:
        recent = list(
            db.scalars(
                signal_query.order_by(desc(TrendSignalEvent.created_at)).limit(max(100, limit * 8))
            )
        )
        return [item for item in recent if _signal_matches_interests(item, interests)][:limit]

    signals = load_matching_signals()
    if interests and len(signals) < 3:
        _refresh_live_signals(db, user, interests, platform_filter)
        signals = load_matching_signals()

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

    recent_notifications = list(
        db.scalars(
            select(IntelligenceNotification)
            .where(IntelligenceNotification.user_id == user_id)
            .order_by(desc(IntelligenceNotification.created_at))
            .limit(100)
        )
    )
    notifications = [
        item
        for item in recent_notifications
        if str(item.related_topic or "").startswith("Pulse incident #") or _matches_niche(
            f"{item.related_topic} {item.title} {item.body}",
            interests,
        )
    ][:12]

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
        summary=(
            "Cr8or Intelligence is showing current, sourced signals matched to your saved niche."
            if interests
            else "Choose a content niche in your creator profile to receive relevant trend updates."
        ),
        interests=interests,
        signals=serialized,
        notifications=notification_items,
        source_stats={
            "signals": len(serialized),
            "notifications": len(notification_items),
            "mode": "live-niche-intelligence",
        },
    )



@router.get("/notifications/{user_id}")
def notification_inbox(
    user_id: int,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=50),
    unread_only: bool = False,
    category: str = Query(default="all", pattern="^(all|support|trends)$"),
    q: str = Query(default="", max_length=100),
    selected_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
) -> dict:
    """Read the inbox without refreshing trends or excluding support messages."""
    base = [IntelligenceNotification.user_id == user_id]
    filters = list(base)
    if unread_only:
        filters.append(IntelligenceNotification.is_read == False)  # noqa: E712
    support = IntelligenceNotification.related_topic.startswith("Pulse incident #")
    if category == "support":
        filters.append(support)
    elif category == "trends":
        filters.append(~support)
    if q.strip():
        # Literal substring matching: SQLAlchemy escapes LIKE wildcard characters.
        filters.append(or_(
            IntelligenceNotification.title.icontains(q.strip(), autoescape=True),
            IntelligenceNotification.body.icontains(q.strip(), autoescape=True),
        ))
    rows = list(db.scalars(
        select(IntelligenceNotification).where(*filters)
        .order_by(desc(IntelligenceNotification.created_at), desc(IntelligenceNotification.id))
        .offset(offset).limit(limit)
    ))
    total = db.scalar(select(func.count(IntelligenceNotification.id)).where(*filters)) or 0
    unread = db.scalar(select(func.count(IntelligenceNotification.id)).where(
        *base, IntelligenceNotification.is_read == False,  # noqa: E712
    )) or 0

    def serialize(item: IntelligenceNotification) -> dict:
        return {
            "id": item.id, "title": item.title, "body": item.body,
            "severity": item.severity, "related_topic": item.related_topic,
            "is_read": item.is_read, "created_at": _as_iso(item.created_at),
        }

    selected = db.scalar(select(IntelligenceNotification).where(
        *base, IntelligenceNotification.id == selected_id,
    )) if selected_id else None
    return {
        "notifications": [serialize(item) for item in rows],
        "total": total, "unread_count": unread,
        "has_more": offset + len(rows) < total,
        "selected": serialize(selected) if selected else None,
    }

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
