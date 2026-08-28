from collections import Counter, defaultdict
from datetime import UTC, datetime
from typing import Literal

import httpx
from fastapi import APIRouter, Depends
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.deps import get_db
from app.db.models import AIGeneration, AnalyticsSnapshot, ConnectedPlatform, ContentPost

router = APIRouter(prefix="/analytics", tags=["analytics"])


_MODEL_COST_PER_1M = {
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
}


def _refresh_google_access_token(refresh_token: str) -> dict | None:
    client_id = str(settings.google_client_id or "").strip()
    client_secret = str(settings.google_client_secret or "").strip()
    if not refresh_token or not client_id or not client_secret:
        return None

    try:
        with httpx.Client(timeout=12.0) as client:
            response = client.post(
                "https://oauth2.googleapis.com/token",
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                data={
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                },
            )
        if response.status_code >= 400:
            return None
        payload = response.json()
        return payload if isinstance(payload, dict) else None
    except Exception:
        return None


@router.get("/overview/{user_id}")
def analytics_overview(user_id: int, window: Literal["7d", "30d", "90d"] = "30d", db: Session = Depends(get_db)) -> dict:
    snapshots = db.scalars(
        select(AnalyticsSnapshot)
        .where(AnalyticsSnapshot.user_id == user_id, AnalyticsSnapshot.metric_window == window)
        .order_by(desc(AnalyticsSnapshot.created_at))
        .limit(300)
    )
    filtered_data = list(snapshots)

    posts = list(
        db.scalars(
            select(ContentPost)
            .where(ContentPost.user_id == user_id)
            .order_by(desc(ContentPost.created_at))
            .limit(80)
        )
    )
    platforms = list(
        db.scalars(
            select(ConnectedPlatform)
            .where(ConnectedPlatform.user_id == user_id)
            .order_by(desc(ConnectedPlatform.created_at))
        )
    )
    ai_generations = list(
        db.scalars(
            select(AIGeneration)
            .join(ContentPost, AIGeneration.post_id == ContentPost.id)
            .where(ContentPost.user_id == user_id)
            .order_by(desc(AIGeneration.created_at))
            .limit(80)
        )
    )

    latest_by_platform = {}
    for snapshot in filtered_data:
        latest_by_platform.setdefault(snapshot.platform.value, snapshot)

    engagement = [
        {
            "platform": snapshot.platform.value,
            "engagement_rate": snapshot.engagement_rate,
            "followers_delta": snapshot.followers_delta,
            "caption_effectiveness": snapshot.caption_effectiveness,
        }
        for snapshot in latest_by_platform.values()
    ]

    avg_engagement = (
        sum(item["engagement_rate"] for item in engagement) / len(engagement) if engagement else 0.0
    )
    avg_caption_effectiveness = (
        sum(item["caption_effectiveness"] for item in engagement) / len(engagement) if engagement else 0.0
    )
    total_reach_estimate = None  # Reach cannot be inferred from an engagement rate.
    audience_growth = sum(item["followers_delta"] for item in engagement)
    top_platform = max(engagement, key=lambda item: item["engagement_rate"], default=None)

    posting_hours = [snapshot.best_posting_hour for snapshot in filtered_data if snapshot.best_posting_hour is not None]
    posting_time_counts = Counter(posting_hours)
    best_posting_times = [
        f"{hour % 12 or 12}:00 {'AM' if hour < 12 else 'PM'}"
        for hour, _ in posting_time_counts.most_common(3)
    ]

    caption_lengths = [len(post.master_caption or "") for post in posts if (post.master_caption or "").strip()]
    best_caption_length = 0  # Caption length alone does not establish performance.

    region_counter: Counter[str] = Counter()
    language_counter: Counter[str] = Counter()
    content_type_counter: Counter[str] = Counter()

    for snapshot in filtered_data:
        payload = snapshot.payload if isinstance(snapshot.payload, dict) else {}
        top_regions = payload.get("top_regions") if isinstance(payload.get("top_regions"), list) else []
        languages = payload.get("languages") if isinstance(payload.get("languages"), list) else []
        content_type = payload.get("content_type")

        for region in top_regions:
            value = str(region).strip()
            if value:
                region_counter[value] += 1

        for language in languages:
            value = str(language).strip()
            if value:
                language_counter[value] += 1

        if isinstance(content_type, str) and content_type.strip():
            content_type_counter[content_type.strip()] += 1

    top_regions = [region for region, _ in region_counter.most_common(3)]
    top_languages = [language for language, _ in language_counter.most_common(3)]
    dominant_content_type = (
        content_type_counter.most_common(1)[0][0] if content_type_counter else ""
    )

    strongest_post = None  # Requires comparable post-level metrics.
    latest_post = posts[0] if posts else None
    active_platform_count = len([platform for platform in platforms if platform.is_active])
    ai_generation_count = len(ai_generations)

    trend_series_map: dict[str, list[dict]] = defaultdict(list)
    platform_snapshot_map: dict[str, list[AnalyticsSnapshot]] = defaultdict(list)

    for snapshot in sorted(filtered_data, key=lambda item: item.created_at):
        platform_name = snapshot.platform.value
        trend_series_map[platform_name].append(
            {
                "label": snapshot.created_at.strftime("%b %d") if snapshot.created_at else snapshot.metric_window,
                "created_at": snapshot.created_at.isoformat() if snapshot.created_at else None,
                "engagement_rate": snapshot.engagement_rate,
                "followers_delta": snapshot.followers_delta,
                "caption_effectiveness": snapshot.caption_effectiveness,
            }
        )
        platform_snapshot_map[platform_name].append(snapshot)

    trend_series = {
        platform: points[-12:]
        for platform, points in trend_series_map.items()
    }

    platform_deltas: list[dict] = []
    for platform, snapshots_for_platform in platform_snapshot_map.items():
        ordered = sorted(snapshots_for_platform, key=lambda item: item.created_at, reverse=True)
        current = ordered[0]
        previous = ordered[1] if len(ordered) > 1 else None
        platform_deltas.append(
            {
                "platform": platform,
                "current_engagement_rate": current.engagement_rate,
                "engagement_delta": current.engagement_rate - (previous.engagement_rate if previous else 0.0),
                "current_followers_delta": current.followers_delta,
                "followers_delta_change": current.followers_delta - (previous.followers_delta if previous else 0),
                "caption_effectiveness": current.caption_effectiveness,
                "snapshot_count": len(ordered),
            }
        )

    platform_deltas.sort(key=lambda item: item["current_engagement_rate"], reverse=True)

    platform_playbooks: list[dict] = []
    for platform, snapshots_for_platform in platform_snapshot_map.items():
        ordered = sorted(snapshots_for_platform, key=lambda item: item.created_at, reverse=True)
        current = ordered[0]
        reasons: list[str] = []
        if current.engagement_rate >= avg_engagement and current.engagement_rate > 0:
            reasons.append("Engagement is at or above your current cross-platform average.")
        if current.caption_effectiveness >= avg_caption_effectiveness and current.caption_effectiveness > 0:
            reasons.append("Your caption quality signal is outperforming your usual baseline.")
        if current.followers_delta > 0:
            reasons.append("This platform is contributing positive audience growth.")
        best_hour = getattr(current, "best_posting_hour", None)
        if best_hour is not None:
            reasons.append(f"Your strongest observed posting window is around {int(best_hour):02d}:00.")
        if not reasons:
            reasons.append("More snapshots are needed before a reliable performance pattern can be identified.")

        platform_playbooks.append(
            {
                "platform": platform,
                "best_posting_hour": best_hour,
                "engagement_rate": current.engagement_rate,
                "followers_delta": current.followers_delta,
                "caption_effectiveness": current.caption_effectiveness,
                "snapshot_count": len(ordered),
                "confidence": "directional",
                "why_it_is_working": reasons,
                "recommended_test": (
                    "Repeat the winning structure in the next posting window and compare engagement."
                    if len(ordered) >= 2
                    else "Publish a few more comparable posts to establish a dependable baseline."
                ),
            }
        )

    platform_playbooks.sort(key=lambda item: item["engagement_rate"], reverse=True)

    brain_insights = [
        (
            f"Your strongest platform right now is {(top_platform or {}).get('platform', '').replace('_', ' ')} with {((top_platform or {}).get('engagement_rate', 0) * 100):.1f}% engagement."
            if top_platform
            else "No strongest platform yet. Connect channels and publish to start tracking."
        ),
        (
            f"Saved snapshots suggest testing around {best_posting_times[0]}; this is not audience activity data."
            if best_posting_times and best_caption_length > 0
            else "Not enough analytics snapshots yet to detect posting windows and caption length trends."
        ),
        (
            f"Recent content momentum is tied to {dominant_content_type} formats"
            if dominant_content_type
            else "Content momentum will appear here after your first live analytics snapshots."
        ),
        (
            f"AI-assisted workflow is active with {ai_generation_count} generations recorded."
            if ai_generation_count
            else "Generate and publish more AI-assisted content to unlock deeper analytics."
        ),
    ]

    performance_signals = {
        "watch_time_curve": "Watch-time data is not available.",
        "drop_off_point": "Retention data is not available.",
        "replay_spike": "Replay data is not available.",
        "emotion_signal": "Not measured.",
    }
    category_scores = []

    return {
        "engagement": engagement,
        "summary": {
            "total_reach_estimate": total_reach_estimate,
            "audience_growth": audience_growth,
            "average_engagement_rate": round(avg_engagement, 4),
            "average_caption_effectiveness": round(avg_caption_effectiveness, 4),
            "top_platform": (top_platform or {}).get("platform", ""),
            "connected_platforms": active_platform_count,
            "total_posts": len(posts),
            "ai_generations": ai_generation_count,
            "latest_post_title": latest_post.title if latest_post else None,
            "strongest_post_title": strongest_post.title if strongest_post else None,
        },
        "insights": {
            "best_caption_length": best_caption_length,
            "best_posting_times": best_posting_times,
            "trend": "Saved platform snapshots available."
            if engagement
            else "No snapshots for this reporting window yet.",
        },
        "active_window": window,
        "trend_series": trend_series,
        "platform_deltas": platform_deltas,
        "platform_playbooks": platform_playbooks,
        "data_quality": {
            "post_level_metrics_available": False,
            "message": "These insights use platform snapshots. Connect post-level reach, shares, saves, and watch-time metrics to explain exactly why an individual post went viral.",
        },
        "brain_insights": brain_insights,
        "audience": {
            "top_regions": top_regions,
            "languages": top_languages,
            "content_preference": dominant_content_type.title() if dominant_content_type else "",
            "peak_active_window": " - ".join(best_posting_times[:2]) if len(best_posting_times) > 1 else (best_posting_times[0] if best_posting_times else ""),
            "loyalty_score": None,
            "device_split": "",
            "mood_signal": "",
        },
        "performance": performance_signals,
        "category_intelligence": category_scores,
    }


@router.get("/ai-usage/{user_id}")
def ai_usage_summary(user_id: int, db: Session = Depends(get_db)) -> dict:
    rows = list(
        db.scalars(
            select(AIGeneration)
            .join(ContentPost, AIGeneration.post_id == ContentPost.id)
            .where(ContentPost.user_id == user_id)
            .order_by(desc(AIGeneration.created_at))
            .limit(200)
        )
    )

    total_generations = len(rows)
    total_prompt_tokens = 0
    total_completion_tokens = 0
    total_latency_ms = 0
    latency_count = 0
    template_versions: dict[str, int] = {}
    model_counts: dict[str, int] = {}
    estimated_cost_usd = 0.0

    for row in rows:
        model_name = row.model_name or "unknown"
        model_counts[model_name] = model_counts.get(model_name, 0) + 1

        payload = row.output_payload or {}
        usage = payload.get("usage") if isinstance(payload, dict) else {}
        if not isinstance(usage, dict):
            usage = {}

        prompt_tokens = int(usage.get("prompt_tokens") or 0)
        completion_tokens = int(usage.get("completion_tokens") or 0)
        total_prompt_tokens += prompt_tokens
        total_completion_tokens += completion_tokens

        rates = _MODEL_COST_PER_1M.get(model_name)
        if rates:
            estimated_cost_usd += (prompt_tokens / 1_000_000) * rates["input"]
            estimated_cost_usd += (completion_tokens / 1_000_000) * rates["output"]

        latency_ms = payload.get("latency_ms") if isinstance(payload, dict) else None
        if isinstance(latency_ms, int) and latency_ms >= 0:
            total_latency_ms += latency_ms
            latency_count += 1

        prompt_template_version = payload.get("prompt_template_version") if isinstance(payload, dict) else None
        if isinstance(prompt_template_version, str) and prompt_template_version:
            template_versions[prompt_template_version] = (
                template_versions.get(prompt_template_version, 0) + 1
            )

    average_latency_ms = int(total_latency_ms / latency_count) if latency_count else 0
    most_used_template = (
        max(template_versions.items(), key=lambda item: item[1])[0] if template_versions else "unknown"
    )

    return {
        "total_generations": total_generations,
        "total_prompt_tokens": total_prompt_tokens,
        "total_completion_tokens": total_completion_tokens,
        "average_latency_ms": average_latency_ms,
        "estimated_cost_usd": round(estimated_cost_usd, 6),
        "models": model_counts,
        "template_versions": template_versions,
        "most_used_template": most_used_template,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Live platform analytics — fetches real data from connected social APIs
# ─────────────────────────────────────────────────────────────────────────────

def _insight_values(payload: dict) -> dict:
    """Preserve real zeros, total_value responses, and per-metric time coverage."""
    result: dict = {"metric_details": {}}
    for item in payload.get("data", []):
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "")
        if not name:
            continue
        total = item.get("total_value")
        value = total.get("value") if isinstance(total, dict) else None
        values = item.get("values") if isinstance(item.get("values"), list) else []
        points = [point for point in values if isinstance(point, dict)]
        if value is None and points:
            # A time series is not a period total (especially unique reach).
            value = points[-1].get("value")
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            result[name] = value
            result["metric_details"][name] = {
                "period": item.get("period", ""),
                "coverage": "reported total" if isinstance(total, dict) else "latest reported interval",
                "end_time": points[-1].get("end_time") if points else None,
            }
    return result


def _graph_error(response: httpx.Response, fallback: str) -> str:
    try:
        detail = response.json().get("error", {})
        return str(detail.get("message") or fallback)[:180]
    except Exception:
        return fallback


def _fetch_facebook_page_insights(page_id: str, page_token: str) -> dict:
    """Fetch page totals and try both supported page edges for recent content."""
    try:
        with httpx.Client(timeout=12.0) as client:
            page_resp = client.get(
                f"https://graph.facebook.com/v22.0/{page_id}",
                params={"fields": "id,name,fan_count,followers_count", "access_token": page_token},
            )
            if page_resp.status_code >= 400:
                return {"error": "Facebook account statistics could not be retrieved. Check the Page access token permissions."}
            page = page_resp.json()
            result: dict = {
                "page_name": page.get("name", ""),
                "page_fans": page.get("fan_count"),
                "followers_count": page.get("followers_count"),
                "warnings": [],
            }

            # /posts is more restrictive for some Page tokens. /feed is a safe
            # fallback and still returns the Page's own published content.
            fields = "id,message,created_time,permalink_url,likes.summary(true),comments.summary(true)"
            posts = []
            last_error = ""
            for edge in ("posts", "feed"):
                response = client.get(
                    f"https://graph.facebook.com/v22.0/{page_id}/{edge}",
                    params={"fields": fields, "limit": 10, "access_token": page_token},
                )
                if response.status_code < 400:
                    payload = response.json()
                    posts = payload.get("data", []) if isinstance(payload, dict) else []
                    if posts or edge == "feed":
                        break
                last_error = _graph_error(response, "Recent Page posts were not returned.")
            recent = [{
                "id": post.get("id"), "caption": post.get("message", ""),
                "timestamp": post.get("created_time"), "permalink": post.get("permalink_url"),
                "like_count": (post.get("likes", {}).get("summary", {}).get("total_count")),
                "comments_count": (post.get("comments", {}).get("summary", {}).get("total_count")),
            } for post in posts if isinstance(post, dict)]
            result["recent_posts"] = recent
            result["recent_posts_count"] = len(recent)
            if last_error and not recent:
                result["warnings"].append("Recent posts need Page content permissions. Reconnect Facebook and approve Page content access.")
                result["provider_error"] = last_error
            for field, label in (("like_count", "avg_likes"), ("comments_count", "avg_comments")):
                counts = [post[field] for post in recent if isinstance(post[field], (int, float))]
                if counts:
                    result[label] = round(sum(counts) / len(counts), 1)

            # Request each insight separately: one unavailable/deprecated metric
            # must not hide the metrics that this Page token can still provide.
            for metric, key in (
                ("page_impressions_unique", "page_impressions_unique"),
                ("page_post_engagements", "page_engaged_users"),
            ):
                response = client.get(
                    f"https://graph.facebook.com/v22.0/{page_id}/insights",
                    params={"metric": metric, "period": "day", "access_token": page_token},
                )
                if response.status_code < 400:
                    parsed = _insight_values(response.json())
                    if metric in parsed:
                        result[key] = parsed[metric]
            return result
    except Exception:
        return {"error": "Facebook did not respond. Please try refreshing later."}



def _fetch_instagram_insights(ig_user_id: str, page_token: str) -> dict:
    """Fetch Instagram profile, per-metric account insights and a post sample."""
    try:
        with httpx.Client(timeout=12.0) as client:
            profile_resp = client.get(
                f"https://graph.facebook.com/v22.0/{ig_user_id}",
                params={"fields": "username,followers_count,media_count", "access_token": page_token},
            )
            if profile_resp.status_code >= 400:
                return {"error": "Instagram account statistics could not be retrieved. Check professional-account permissions."}
            profile = profile_resp.json()
            insights: dict = {
                "username": profile.get("username", ""),
                "followers_count": profile.get("followers_count"),
                "media_count": profile.get("media_count"),
                "warnings": [],
            }

            # Fetch metrics independently. Meta may reject one metric (or a
            # removed metric) while still allowing the others.
            for metric in ("reach", "views", "accounts_engaged", "total_interactions"):
                response = client.get(
                    f"https://graph.facebook.com/v22.0/{ig_user_id}/insights",
                    params={"metric": metric, "period": "day", "metric_type": "total_value", "access_token": page_token},
                )
                if response.status_code < 400:
                    parsed = _insight_values(response.json())
                    insights.update(parsed)
                else:
                    insights.setdefault("insight_errors", {})[metric] = _graph_error(response, "Metric unavailable")
            if len(insights.get("insight_errors", {})) == 4:
                insights["warnings"].append("Instagram insight permissions or metric availability need attention. Reconnect the professional account and approve insights access.")

            media_resp = client.get(
                f"https://graph.facebook.com/v22.0/{ig_user_id}/media",
                params={"fields": "id,caption,timestamp,like_count,comments_count,media_type,permalink", "access_token": page_token, "limit": 10},
            )
            if media_resp.status_code < 400:
                recent = media_resp.json().get("data", [])[:10]
                insights["recent_posts"] = recent
                insights["recent_posts_count"] = len(recent)
                for field, label in (("like_count", "avg_likes"), ("comments_count", "avg_comments")):
                    counts = [post[field] for post in recent if isinstance(post.get(field), (int, float))]
                    if counts:
                        insights[label] = round(sum(counts) / len(counts), 1)
            else:
                insights["warnings"].append("Instagram recent posts need content-list permission. Reconnect the professional account and approve content access.")
                insights["provider_error"] = _graph_error(media_resp, "Recent posts unavailable.")
            return insights
    except Exception:
        return {"error": "Instagram did not respond. Please try refreshing later."}



def _fetch_threads_insights(threads_user_id: str, access_token: str) -> dict:
    """Fetch account-level Threads insights with the OAuth insight permission."""
    try:
        with httpx.Client(timeout=12.0) as client:
            response = client.get(
                f"https://graph.threads.net/v1.0/{threads_user_id}/threads_insights",
                params={
                    "metric": "views,likes,replies,reposts,quotes,followers_count",
                    "access_token": access_token,
                },
            )
        if response.status_code >= 400:
            detail = (response.json().get("error") or {}).get("message", response.text[:180])
            return {"error": detail}

        metrics = _insight_values(response.json())
        engagement_names = ("likes", "replies", "reposts", "quotes")
        if all(name in metrics for name in engagement_names):
            metrics["total_engagement"] = sum(metrics[name] for name in engagement_names)
        return metrics
    except Exception as exc:
        return {"error": str(exc)[:120]}


@router.get("/live/{user_id}")
def live_platform_analytics(
    user_id: int,
    db: Session = Depends(get_db),
    platform: Literal["all", "instagram", "facebook", "youtube_shorts", "threads"] = "all",
) -> dict:
    """Fetch real-time analytics from each connected social media platform."""
    platform_filter = platform
    platforms = list(
        db.scalars(
            select(ConnectedPlatform)
            .where(ConnectedPlatform.user_id == user_id, ConnectedPlatform.is_active == True)  # noqa: E712
        )
    )

    results: list[dict] = []
    fetched_at = datetime.now(tz=UTC).isoformat()

    for platform in platforms:
        platform_name = platform.platform.value
        if platform_filter != "all" and platform_name != platform_filter:
            continue
        auth = platform.auth_meta or {}
        if not isinstance(auth, dict):
            continue

        connection_method = str(auth.get("connection_method") or "").strip()
        if connection_method != "oauth":
            results.append({
                "platform": platform_name,
                "connection_id": platform.id,
                "handle": platform.account_handle,
                "status": "manual",
                "message": "Manually linked — real insights require OAuth connection.",
                "data": {},
            })
            continue

        access_token = str(auth.get("access_token") or "").strip()
        if not access_token:
            results.append({
                "platform": platform_name,
                "connection_id": platform.id,
                "handle": platform.account_handle,
                "status": "no_token",
                "data": {},
            })
            continue

        if platform_name == "threads":
            threads_user_id = str(auth.get("platform_user_id") or "").strip()
            if threads_user_id:
                data = _fetch_threads_insights(threads_user_id, access_token)
            else:
                data = {"error": "Threads user ID not stored — reconnect Threads."}
            results.append({
                "platform": platform_name,
                "connection_id": platform.id,
                "handle": platform.account_handle,
                "status": "ok" if "error" not in data else "permission_required",
                "message": (
                    "Threads insights were retrieved."
                    if "error" not in data
                    else "Reconnect Threads to grant the threads_manage_insights permission."
                ),
                "fetched_at": fetched_at,
                "data": data,
            })
            continue

        if platform_name == "facebook":
            page_id = str(auth.get("page_id") or auth.get("platform_user_id") or "").strip()
            if page_id:
                data = _fetch_facebook_page_insights(page_id, access_token)
            else:
                data = {"error": "Page ID not stored — reconnect Facebook."}
            results.append({
                "platform": platform_name,
                "connection_id": platform.id,
                "handle": platform.account_handle,
                "status": "ok" if "error" not in data else "error",
                "fetched_at": fetched_at,
                "data": data,
            })

        elif platform_name == "instagram":
            ig_user_id = str(auth.get("platform_user_id") or "").strip()
            # Page access token is stored as access_token for IG after OAuth
            if ig_user_id:
                data = _fetch_instagram_insights(ig_user_id, access_token)
            else:
                data = {"error": "Instagram user ID not stored — reconnect Instagram."}
            results.append({
                "platform": platform_name,
                "connection_id": platform.id,
                "handle": platform.account_handle,
                "status": "ok" if "error" not in data else "error",
                "fetched_at": fetched_at,
                "data": data,
            })

        elif platform_name == "youtube_shorts":
            try:
                refresh_token = str(auth.get("refresh_token") or "").strip()
                maybe_refreshed = _refresh_google_access_token(refresh_token)
                if maybe_refreshed and maybe_refreshed.get("access_token"):
                    access_token = str(maybe_refreshed.get("access_token") or "").strip()
                    auth["access_token"] = access_token
                    expires_in = int(maybe_refreshed.get("expires_in") or 3600)
                    auth["token_expires_at"] = datetime.now(tz=UTC).isoformat()
                    platform.auth_meta = auth
                    db.commit()

                with httpx.Client(timeout=12.0) as client:
                    resp = client.get(
                        "https://www.googleapis.com/youtube/v3/channels",
                        headers={"Authorization": f"Bearer {access_token}"},
                        params={"part": "statistics,snippet", "mine": "true"},
                    )
                if resp.status_code < 400:
                    items = resp.json().get("items", [])
                    if items:
                        stats = items[0].get("statistics", {})
                        snippet = items[0].get("snippet", {})
                        data = {
                            "channel_title": snippet.get("title", ""),
                            "subscriber_count": None if stats.get("hiddenSubscriberCount") or "subscriberCount" not in stats else int(stats["subscriberCount"]),
                            "view_count": int(stats["viewCount"]) if "viewCount" in stats else None,
                            "video_count": int(stats["videoCount"]) if "videoCount" in stats else None,
                        }
                    else:
                        data = {"error": "No YouTube channel found."}
                else:
                    data = {"error": resp.json().get("error", {}).get("message", "YT API error")}
            except Exception as exc:
                data = {"error": str(exc)[:120]}

            results.append({
                "platform": platform_name,
                "connection_id": platform.id,
                "handle": platform.account_handle,
                "status": "ok" if "error" not in data else "error",
                "fetched_at": fetched_at,
                "data": data,
            })

        else:
            results.append({
                "platform": platform_name,
                "connection_id": platform.id,
                "handle": platform.account_handle,
                "status": "unsupported",
                "message": f"Live analytics not yet available for {platform_name}.",
                "data": {},
            })

    return {
        "user_id": user_id,
        "fetched_at": fetched_at,
        "platforms": results,
    }
