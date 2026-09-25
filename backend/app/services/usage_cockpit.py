"""Extend Pulse with verified usage context, signed sessions and provider-call correlation."""
from functools import wraps
import hashlib
import hmac
import json
import os
import time
from time import perf_counter

from fastapi import HTTPException
from fastapi.responses import JSONResponse, Response
from sqlalchemy.exc import SQLAlchemyError

from app.usage import ledger

COOKIE = "xcr8_usage_session"
LOGIN_PATHS = {"/api/v1/auth/login", "/api/v1/auth/google/session",
               "/api/v1/auth/signup/verify-code", "/api/v1/auth/signup/verify-link",
               "/api/v1/auth/signup/verify-password"}


def sign_user(user_id, expires):
    secret = os.getenv("PULSE_SESSION_SECRET", "")
    if len(secret) < 32:
        raise ledger.UsageBlocked("AI session signing is not configured.", 503)
    payload = f"{int(user_id)}.{int(expires)}"
    return payload + "." + hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()


def verify_user(token):
    try:
        user_id, expires, _ = token.split(".")
        if int(user_id) < 1 or int(expires) <= time.time():
            return None
        return int(user_id) if hmac.compare_digest(token, sign_user(user_id, expires)) else None
    except (ValueError, TypeError):
        return None


def tracked(feature):
    def decorate(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if not ledger.enabled():
                return fn(*args, **kwargs)
            ctx = ledger.context.get() or {}
            ident = None
            token = None
            status = "failure"
            started = perf_counter()
            try:
                actual_feature = str(args[0]).strip("/").replace("/", "_") if feature == "ai_service" and args else feature
                ident = ledger.start_request(actual_feature)
                ctx["last_request_id"] = ident
                token = ledger.context.set({**ctx, "request_id": ident, "feature": actual_feature})
                result = fn(*args, **kwargs)
                status = "success"
                return result
            except ledger.UsageBlocked as exc:
                status = "blocked"
                refund_blocked(ctx)
                raise HTTPException(exc.status, str(exc)) from exc
            except HTTPException as exc:
                if exc.status_code in {401, 403, 413, 429, 503}:
                    status = "blocked"
                    refund_blocked(ctx)
                raise
            except SQLAlchemyError as exc:
                raise HTTPException(503, "AI usage tracking is temporarily unavailable. Please try again later.") from exc
            finally:
                if ident:
                    try:
                        ledger.finish_request(ident, status, int((perf_counter()-started)*1000))
                    except SQLAlchemyError:
                        ledger.log.error("Pulse request settlement pending: %s", ident)
                if token:
                    ledger.context.reset(token)
        return wrapper
    return decorate


def refund_blocked(ctx):
    debit = ctx.get("new_credit_debit")
    if debit:
        from app.services.entitlements import refund_usage
        try:
            refund_usage(debit[0], debit[1], reason="pulse_budget_or_tracking_blocked")
        except SQLAlchemyError:
            ledger.log.error("Pulse credit refund needs reconciliation: ledger=%s", debit[1])


def install(app):
    @app.middleware("http")
    async def usage_identity(request, call_next):
        if not ledger.enabled():
            return await call_next(request)
        path = request.url.path.rstrip("/")
        is_ai = request.method == "POST" and (path.startswith("/api/v1/ai/") or path.startswith("/api/v1/distribution"))
        is_event = path == "/api/v1/pulse/value-event"
        ctx_token = None
        try:
            if is_ai or is_event:
                user_id = verify_user(request.cookies.get(COOKIE, ""))
                if not user_id:
                    return JSONResponse({"detail": "Please sign in again to use AI."}, status_code=401)
                try:
                    body = await request.json()
                except (ValueError, UnicodeDecodeError):
                    return JSONResponse({"detail": "Invalid request."}, status_code=400)
                claimed = body.get("user_id") if isinstance(body, dict) else None
                header_user = request.headers.get("x-xcr8-user-id")
                if (claimed is not None and str(claimed) != str(user_id)) or (header_user and header_user != str(user_id)):
                    return JSONResponse({"detail": "This request belongs to another account."}, status_code=403)
                ctx_token = ledger.context.set({"user_id": user_id})
            response = await call_next(request)
            ctx = ledger.context.get()
            if ctx and ctx.get("last_request_id"):
                response.headers["X-Pulse-Request-Id"] = ctx["last_request_id"]
            # Issue a scoped HttpOnly credential only after existing login verification succeeds.
            # Never issue one from /session/{id}, profile edits or client-provided identity alone.
            if request.method == "POST" and path in LOGIN_PATHS and response.status_code == 200:
                raw = b"".join([chunk async for chunk in response.body_iterator])
                payload = json.loads(raw)
                expires = int(time.time()) + 86400
                signed = sign_user(payload["user_id"], expires)
                response = Response(raw, status_code=response.status_code, headers=dict(response.headers), media_type="application/json")
                response.set_cookie(COOKIE, signed, httponly=True, secure=request.url.scheme == "https" or os.getenv("ENVIRONMENT") == "production",
                                    samesite="lax", max_age=86400, path="/")
            return response
        except ledger.UsageBlocked as exc:
            return JSONResponse({"detail": str(exc)}, status_code=exc.status)
        finally:
            if ctx_token:
                ledger.context.reset(ctx_token)
