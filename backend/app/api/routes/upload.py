from __future__ import annotations

import os
import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/upload", tags=["upload"])

# Use /tmp in serverless environments because application directories are read-only.
_UPLOAD_DIR = Path(tempfile.gettempdir()) / "xcr8-uploads"
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
async def upload_media(request: Request, file: UploadFile) -> JSONResponse:
    if file.content_type not in _ALLOWED_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported media type: {file.content_type}. Allowed: image or video.",
        )

    content = await file.read()
    if len(content) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 50 MB limit.")

    try:
        _UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise HTTPException(status_code=500, detail="Upload storage is unavailable right now.") from exc

    ext = Path(file.filename or "upload").suffix or ".bin"
    filename = f"{uuid.uuid4().hex}{ext}"
    dest = _UPLOAD_DIR / filename

    try:
        dest.write_bytes(content)
    except OSError as exc:
        raise HTTPException(status_code=500, detail="Unable to save uploaded file.") from exc

    public_url = str(request.url_for("get_uploaded_media", filename=filename))
    return JSONResponse({"url": public_url, "file_name": filename})


@router.get("/{filename}", name="get_uploaded_media")
async def get_uploaded_media(filename: str) -> FileResponse:
    safe_name = os.path.basename(filename)
    if not safe_name:
        raise HTTPException(status_code=404, detail="File not found")

    target = _UPLOAD_DIR / safe_name
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(path=target, filename=safe_name)
