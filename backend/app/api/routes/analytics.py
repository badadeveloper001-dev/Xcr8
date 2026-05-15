from fastapi import APIRouter, Depends
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.db.models import AnalyticsSnapshot

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/overview/{user_id}")
def analytics_overview(user_id: int, db: Session = Depends(get_db)) -> dict:
    snapshots = db.scalars(
        select(AnalyticsSnapshot)
        .where(AnalyticsSnapshot.user_id == user_id)
        .order_by(desc(AnalyticsSnapshot.created_at))
        .limit(30)
    )
    data = list(snapshots)

    return {
        "engagement": [
            {
                "platform": snapshot.platform.value,
                "engagement_rate": snapshot.engagement_rate,
                "followers_delta": snapshot.followers_delta,
                "caption_effectiveness": snapshot.caption_effectiveness,
            }
            for snapshot in data
        ],
        "insights": {
            "best_caption_length": 110,
            "best_posting_times": ["20:00", "19:30", "12:00"],
            "trend": "Short hooks with strong local slang outperform baseline by 28%",
        },
    }
