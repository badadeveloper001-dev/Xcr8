from __future__ import annotations

import os
import mimetypes
import tempfile
import uuid
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.core.config import settings

router = APIRouter(prefix="/upload", tags=["upload"])

# Use /tmp in serverless environments because application directories are read-only.
_UPLOAD_DIR = Path(tempfile.gettempdir()) / "xcr8-uploads"
_VIDEO_EXTENSIONS = {
    ".mp4", ".m4v", ".mov", ".avi", ".mkv", ".webm", ".flv", ".wmv", ".mpeg", ".mpg", ".3gp", ".m2ts", ".ts",
}
_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tiff", ".svg", ".heic", ".heif", ".avif"}
_MAX_BYTES = 1024 * 1024 * 1024  # 1 GB
_STREAM_CHUNK_BYTES = 8 * 1024 * 1024


def _is_allowed_media_type(content_type: str | None, filename: str | None) -> bool:
    mime = str(content_type or "").strip().lower()
    suffix = Path(filename or "").suffix.lower()

    if mime.startswith("image/") or mime.startswith("video/"):
        return True

    if suffix in _IMAGE_EXTENSIONS or suffix in _VIDEO_EXTENSIONS:
        guessed_mime, _ = mimetypes.guess_type(filename or "")
        guessed_mime = str(guessed_mime or "").lower()
        return guessed_mime.startswith("image/") or guessed_mime.startswith("video/")

    return False


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


def _upload_to_supabase_storage(source_path: Path, filename: str, content_type: str) -> str | None:
    headers = _supabase_storage_headers(content_type)
    base_url = str(settings.supabase_url or "").rstrip("/")
    bucket = str(settings.storage_bucket or "xcr8-assets").strip() or "xcr8-assets"
    if not headers or not base_url:
        return None

    object_path = f"uploads/{filename}"
    try:
        timeout = httpx.Timeout(connect=20.0, read=120.0, write=600.0, pool=30.0)
        with httpx.Client(timeout=timeout) as client:
            with source_path.open("rb") as file_stream:
                response = client.post(
                    f"{base_url}/storage/v1/object/{bucket}/{object_path}",
                    headers=headers,
                    content=file_stream,
                )
        if response.status_code == 400 and "Bucket not found" in response.text and _ensure_supabase_bucket():
            with httpx.Client(timeout=timeout) as client:
                with source_path.open("rb") as file_stream:
                    response = client.post(
                        f"{base_url}/storage/v1/object/{bucket}/{object_path}",
                        headers=headers,
                        content=file_stream,
                    )
        if response.status_code >= 400:
            return None
        return f"{base_url}/storage/v1/object/public/{bucket}/{object_path}"
    except Exception:
        return None


class PresignRequest(BaseModel):
    filename: str
    content_type: str


@router.post("/presign")
def create_presigned_upload_url(body: PresignRequest) -> JSONResponse:
    """Return a Supabase signed upload URL so the browser can upload directly,
    bypassing any Vercel payload size limits."""
    base_url = str(settings.supabase_url or "").rstrip("/")
    key = str(settings.supabase_service_role_key or "").strip()
    bucket = str(settings.storage_bucket or "xcr8-assets").strip() or "xcr8-assets"

    if not base_url or not key:
        raise HTTPException(status_code=503, detail="Storage is not configured on this deployment.")

    if not _is_allowed_media_type(body.content_type, body.filename):
        raise HTTPException(status_code=415, detail="Unsupported media type.")

    ext = Path(body.filename).suffix or ".bin"
    filename = f"{uuid.uuid4().hex}{ext}"
    object_path = f"uploads/{filename}"

    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }

    _ensure_supabase_bucket()

    try:
        with httpx.Client(timeout=20.0) as client:
            resp = client.post(
                f"{base_url}/storage/v1/object/upload/sign/{bucket}/{object_path}",
                headers=headers,
                json={"upsert": False},
            )
        if resp.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"Could not create signed URL: {resp.text[:200]}")
        data = resp.json()
        signed_path = str(data.get("url") or "").strip()
        if not signed_path:
            raise HTTPException(status_code=502, detail="Supabase did not return a signed URL.")
        # signed_path is a relative path like /storage/v1/object/upload/sign/...?token=...
        signed_url = f"{base_url}{signed_path}" if signed_path.startswith("/") else signed_path
        public_url = f"{base_url}/storage/v1/object/public/{bucket}/{object_path}"
        return JSONResponse({"signed_url": signed_url, "public_url": public_url, "file_name": filename})
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Failed to generate upload URL.") from exc


@router.post("")
async def upload_media(request: Request, file: UploadFile) -> JSONResponse:
    if not _is_allowed_media_type(file.content_type, file.filename):
        raise HTTPException(
            status_code=415,
            detail="Unsupported media type. Please upload an image or video file.",
        )

    try:
        _UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise HTTPException(status_code=500, detail="Upload storage is unavailable right now.") from exc

    ext = Path(file.filename or "upload").suffix or ".bin"
    filename = f"{uuid.uuid4().hex}{ext}"

    staged_path = Path(tempfile.gettempdir()) / f"xcr8-stage-{filename}"
    total_bytes = 0
    try:
        with staged_path.open("wb") as destination:
            while True:
                chunk = await file.read(_STREAM_CHUNK_BYTES)
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > _MAX_BYTES:
                    raise HTTPException(status_code=413, detail="File exceeds the 1 GB upload limit.")
                destination.write(chunk)
    finally:
        await file.close()

    # Prefer durable object storage in production.
    detected_type = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"
    durable_url = _upload_to_supabase_storage(staged_path, filename, detected_type)
    if durable_url:
        try:
            staged_path.unlink(missing_ok=True)
        except OSError:
            pass
        return JSONResponse({"url": durable_url, "file_name": filename})

    dest = _UPLOAD_DIR / filename

    try:
        staged_path.replace(dest)
    except OSError as exc:
        raise HTTPException(status_code=500, detail="Unable to save uploaded file.") from exc
    finally:
        try:
            staged_path.unlink(missing_ok=True)
        except OSError:
            pass

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
