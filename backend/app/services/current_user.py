"""Authoritative authenticated-user resolution for user-owned API routes."""
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.db.models import User
from app.services.usage_cockpit import COOKIE, verify_user


def current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    """Resolve the authenticated XCR8 user from the signed HttpOnly session cookie."""
    user_id = verify_user(request.cookies.get(COOKIE, ""))
    if not user_id:
        raise HTTPException(status_code=401, detail="Please sign in again.")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Authenticated account was not found.")
    return user


def require_user_match(user_id: int, user: User = Depends(current_user)) -> User:
    """Authorize a route whose user_id is supplied as a path/query parameter."""
    if user_id != user.id:
        raise HTTPException(status_code=403, detail="This request belongs to another account.")
    return user
