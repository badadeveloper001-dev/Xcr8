from __future__ import annotations

import os
import tempfile
import uuid
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from fastapi.responses import JSONResponse

from app.core.config import settings

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
_MAX_BYTES = 150 * 1024 * 1024  # 150 MB


def _supabase_storage_headers(content_type: str) -> dict[str, str] | None:
    url = str(settings.supabase_url or "").strip()
    key = str(settings.supabase_service_role_key or "").strip()
    if not url or not key:
        return None
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": content_type,
        "x-upsert": "false",
    }


def _ensure_supabase_bucket() -> bool:
    admin_headers = _supabase_storage_headers("application/json")
    base_url = str(settings.supabase_url or "").rstrip("/")
    bucket = str(settings.storage_bucket or "xcr8-assets").strip() or "xcr8-assets"
    if not admin_headers or not base_url:
        return False

    try:
        with httpx.Client(timeout=20.0) as client:
            check = client.get(f"{base_url}/storage/v1/bucket", headers=admin_headers)
            if check.status_code < 400:
                buckets = check.json() if isinstance(check.json(), list) else []
                if any(isinstance(item, dict) and item.get("id") == bucket for item in buckets):
                    return True

            create = client.post(
                f"{base_url}/storage/v1/bucket",
                headers=admin_headers,
                json={"name": bucket, "public": True},
            )
            return create.status_code < 400
    except Exception:
        return False


def _upload_to_supabase_storage(content: bytes, filename: str, content_type: str) -> str | None:
    headers = _supabase_storage_headers(content_type)
    base_url = str(settings.supabase_url or "").rstrip("/")
    bucket = str(settings.storage_bucket or "xcr8-assets").strip() or "xcr8-assets"
    if not headers or not base_url:
        return None

    object_path = f"uploads/{filename}"
    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.post(
                f"{base_url}/storage/v1/object/{bucket}/{object_path}",
                headers=headers,
                content=content,
            )
        if response.status_code == 400 and "Bucket not found" in response.text and _ensure_supabase_bucket():
            with httpx.Client(timeout=30.0) as client:
                response = client.post(
                    f"{base_url}/storage/v1/object/{bucket}/{object_path}",
                    headers=headers,
                    content=content,
                )
        if response.status_code >= 400:
            return None
        return f"{base_url}/storage/v1/object/public/{bucket}/{object_path}"
    except Exception:
        return None


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

    # Prefer durable object storage in production.
    durable_url = _upload_to_supabase_storage(content, filename, file.content_type or "application/octet-stream")
    if durable_url:
        return JSONResponse({"url": durable_url, "file_name": filename})

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
