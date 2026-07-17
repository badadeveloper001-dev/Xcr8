from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.deps import get_db
from app.schemas.mvp import PulseEventIngestRequest
from app.services.pulse import record_pulse_event

router = APIRouter(prefix="/pulse", tags=["pulse"])


@router.post("/report")
def report_pulse_event(
    payload: PulseEventIngestRequest,
    x_pulse_token: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict[str, int | str | None]:
    expected = str(settings.pulse_internal_token or "").strip()
    if not expected or str(x_pulse_token or "").strip() != expected:
        raise HTTPException(status_code=401, detail="Invalid internal Pulse token")

    event = record_pulse_event(db, payload.model_dump())
    return {
        "event_id": event.id,
        "incident_id": event.incident_id,
        "severity": event.severity,
        "error_type": event.error_type,
    }
