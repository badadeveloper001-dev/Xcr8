from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.deps import get_db
from app.services.growth_attribution import (
    VisitCapture,
    capture_visit,
    resolve_campaign,
    resolve_referral_code,
    resolve_watermark,
)

router = APIRouter(tags=["growth-attribution"])

_ATTRIBUTION_COOKIE = "xcr8_attribution"


def _frontend_target(path: str, tracking_id: str) -> str:
    base = str(settings.frontend_url or "").strip().rstrip("/")
    if not base:
        raise HTTPException(status_code=503, detail="Public frontend URL is not configured.")

    parsed = urlsplit(f"{base}/{path.lstrip('/')}")
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query["attribution_token"] = tracking_id
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(query), parsed.fragment))


def _capture(
    request: Request,
    source,
    db: Session,
) -> VisitCapture:
    visitor_token = request.cookies.get(_ATTRIBUTION_COOKIE)
    return capture_visit(
        db,
        source,
        visitor_token=visitor_token,
        landing_url=str(request.url),
        referrer_url=request.headers.get("referer"),
        utm_source=request.query_params.get("utm_source"),
        utm_medium=request.query_params.get("utm_medium"),
        utm_campaign=request.query_params.get("utm_campaign"),
        utm_content=request.query_params.get("utm_content"),
    )


def _redirect(capture: VisitCapture, response: RedirectResponse) -> RedirectResponse:
    response.set_cookie(
        key=_ATTRIBUTION_COOKIE,
        value=capture.visitor_token,
        max_age=60 * 60 * 24 * 30,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
    )
    return response


@router.get("/r/{referral_code}")
def referral_entry(
    referral_code: str,
    request: Request,
    db: Session = Depends(get_db),
) -> Response:
    try:
        source = resolve_referral_code(db, referral_code)
        captured = _capture(request, source, db)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Referral link not found or inactive.") from exc

    return _redirect(
        captured,
        RedirectResponse(
            url=_frontend_target("/auth/signup", captured.tracking_id),
            status_code=307,
        ),
    )


@router.get("/campaign/{campaign_code}")
def campaign_entry(
    campaign_code: str,
    request: Request,
    db: Session = Depends(get_db),
) -> Response:
    try:
        source = resolve_campaign(db, campaign_code)
        captured = _capture(request, source, db)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Campaign link not found or inactive.") from exc

    return _redirect(
        captured,
        RedirectResponse(
            url=_frontend_target("/auth/signup", captured.tracking_id),
            status_code=307,
        ),
    )


@router.get("/c/{watermark_code}")
def watermark_entry(
    watermark_code: str,
    request: Request,
    db: Session = Depends(get_db),
) -> Response:
    try:
        source = resolve_watermark(db, watermark_code)
        captured = _capture(request, source, db)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Watermark link not found or inactive.") from exc

    return _redirect(
        captured,
        RedirectResponse(
            url=_frontend_target("/signup", captured.tracking_id),
            status_code=307,
        ),
    )
