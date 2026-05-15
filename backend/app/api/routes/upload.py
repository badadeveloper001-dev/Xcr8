from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/upload", tags=["upload"])

# ── For dev/MVP: store files locally under a static directory. ──────────────
# In production swap this out for S3/Supabase Storage.
_UPLOAD_DIR = Path(__file__).parents[4] / "public" / "uploads"
_ALLOWED_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "video/mp4",
    "video/quicktime",
    "video/webm",
}
_MAX_BYTES = 50 * 1024 * 1024  # 50 MB


@router.post("")
async def upload_media(file: UploadFile) -> JSONResponse:
    if file.content_type not in _ALLOWED_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported media type: {file.content_type}. Allowed: image or video.",
        )

    content = await file.read()
    if len(content) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 50 MB limit.")

    _UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename or "upload").suffix or ".bin"
    filename = f"{uuid.uuid4().hex}{ext}"
    dest = _UPLOAD_DIR / filename

    dest.write_bytes(content)

    # Return a relative URL that the Next.js frontend can reference directly.
    return JSONResponse({"url": f"/uploads/{filename}"})
