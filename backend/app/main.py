from contextlib import asynccontextmanager
from time import perf_counter
import json
import uuid

import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.core.config import settings
from app.db import models
from app.db.session import SessionLocal, engine
from app.services.pulse import auto_resolve_stable_incidents, is_benign_slow_route, record_pulse_event

logger = logging.getLogger(__name__)


def _extract_identity(request: Request) -> tuple[int | None, str | None]:
    user_id: int | None = None
    email: str | None = None

    path_user_id = request.path_params.get("user_id") if hasattr(request, "path_params") else None
    if path_user_id is not None:
        try:
            user_id = int(path_user_id)
        except (TypeError, ValueError):
            user_id = None

    raw_body = str(getattr(request.state, "body_text", "") or "").strip()
    if raw_body:
        try:
            parsed = json.loads(raw_body)
            if isinstance(parsed, dict):
                body_user_id = parsed.get("user_id")
                body_email = parsed.get("email")
                if user_id is None and body_user_id is not None:
                    try:
                        user_id = int(body_user_id)
                    except (TypeError, ValueError):
                        user_id = None
                if isinstance(body_email, str) and body_email.strip():
                    email = body_email.strip().lower()
        except ValueError:
            pass

    if email is None:
        query_email = request.query_params.get("email")
        if query_email:
            email = query_email.strip().lower()

    return user_id, email


def _should_capture_http_exception(request: Request, status_code: int) -> bool:
    path = request.url.path
    if not path.startswith("/api/v1"):
        return False
    if path.startswith("/api/v1/admin"):
        return False
    if status_code in {404, 405} and request.method == "GET":
        return False
    return status_code >= 400

@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        models.Base.metadata.create_all(bind=engine)
        logger.info("Database schema initialized successfully.")
    except Exception as exc:
        logger.warning("Database schema creation failed (will retry on first request): %s", exc)
    yield


app = FastAPI(title="Xcr8 Backend", version="0.1.0", lifespan=lifespan)


@app.middleware("http")
async def pulse_request_middleware(request: Request, call_next):
    request_id = uuid.uuid4().hex[:16]
    request.state.request_id = request_id
    request.state.pulse_recorded = False
    started = perf_counter()
    request.state.started_at = started

    body = await request.body()
    request.state.body_text = body.decode("utf-8", errors="ignore")[:5000]

    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    request._receive = receive

    response = await call_next(request)
    elapsed_ms = int((perf_counter() - started) * 1000)
    response.headers["x-request-id"] = request_id

    if response.status_code >= 500 and not request.state.pulse_recorded and request.url.path.startswith("/api/v1"):
        user_id, email = _extract_identity(request)
        db = SessionLocal()
        try:
            record_pulse_event(
                db,
                {
                    "event_type": "error",
                    "route": request.url.path,
                    "method": request.method,
                    "http_status": response.status_code,
                    "detail": f"HTTP {response.status_code} response returned by backend.",
                    "request_id": request_id,
                    "response_ms": elapsed_ms,
                    "user_id": user_id,
                    "affected_user_email": email,
                },
            )
            request.state.pulse_recorded = True
        except Exception:
            db.rollback()
            logger.exception("Pulse failed to record 5xx response")
        finally:
            db.close()

    if (
        elapsed_ms >= max(1, int(settings.pulse_slow_request_ms or 6000))
        and request.url.path.startswith("/api/v1")
        and not (response.status_code < 400 and is_benign_slow_route(request.url.path, request.method))
    ):
        user_id, email = _extract_identity(request)
        db = SessionLocal()
        try:
            record_pulse_event(
                db,
                {
                    "event_type": "slow_response",
                    "route": request.url.path,
                    "method": request.method,
                    "http_status": response.status_code,
                    "detail": f"Request exceeded slow-response threshold at {elapsed_ms}ms.",
                    "request_id": request_id,
                    "response_ms": elapsed_ms,
                    "user_id": user_id,
                    "affected_user_email": email,
                    "event_meta": {"threshold_ms": int(settings.pulse_slow_request_ms or 6000)},
                },
            )
        except Exception:
            db.rollback()
            logger.exception("Pulse failed to record slow response")
        finally:
            db.close()

    if (
        response.status_code < 400
        and elapsed_ms < max(1, int(settings.pulse_slow_request_ms or 6000))
        and request.url.path.startswith("/api/v1")
    ):
        db = SessionLocal()
        try:
            auto_resolve_stable_incidents(db, request.url.path, request.method, response.status_code)
        except Exception:
            db.rollback()
            logger.exception("Pulse failed to auto-resolve stable incidents")
        finally:
            db.close()

    return response


@app.exception_handler(HTTPException)
async def pulse_http_exception_handler(request: Request, exc: HTTPException):
    started_at = getattr(request.state, "started_at", None)
    elapsed_ms = int((perf_counter() - started_at) * 1000) if started_at else None
    if _should_capture_http_exception(request, exc.status_code):
        user_id, email = _extract_identity(request)
        db = SessionLocal()
        try:
            record_pulse_event(
                db,
                {
                    "event_type": "error",
                    "route": request.url.path,
                    "method": request.method,
                    "http_status": exc.status_code,
                    "detail": str(exc.detail),
                    "request_id": getattr(request.state, "request_id", None),
                    "response_ms": elapsed_ms,
                    "user_id": user_id,
                    "affected_user_email": email,
                },
            )
            request.state.pulse_recorded = True
        except Exception:
            db.rollback()
            logger.exception("Pulse failed to record HTTPException")
        finally:
            db.close()

    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(Exception)
async def pulse_unhandled_exception_handler(request: Request, exc: Exception):
    user_id, email = _extract_identity(request)
    db = SessionLocal()
    try:
        record_pulse_event(
            db,
            {
                "event_type": "error",
                "route": request.url.path,
                "method": request.method,
                "http_status": 500,
                "detail": str(exc) or exc.__class__.__name__,
                "request_id": getattr(request.state, "request_id", None),
                "user_id": user_id,
                "affected_user_email": email,
                "event_meta": {"exception_type": exc.__class__.__name__},
            },
        )
        request.state.pulse_recorded = True
    except Exception:
        db.rollback()
        logger.exception("Pulse failed to record unhandled exception")
    finally:
        db.close()

    logger.exception("Unhandled backend exception", exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


app.include_router(api_router, prefix="/api/v1")


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "backend", "environment": settings.environment}
