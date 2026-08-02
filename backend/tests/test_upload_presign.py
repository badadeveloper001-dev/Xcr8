import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.routes import upload as upload_route


def test_normalizes_supabase_signed_upload_urls() -> None:
    signed_url = upload_route._normalize_signed_upload_url(
        "https://example.supabase.co",
        "/object/upload/sign/xcr8-assets/uploads/demo.jpg?token=abc",
    )

    assert signed_url == "https://example.supabase.co/storage/v1/object/upload/sign/xcr8-assets/uploads/demo.jpg?token=abc"


def test_leaves_already_prefixed_signed_upload_urls_unchanged() -> None:
    signed_url = upload_route._normalize_signed_upload_url(
        "https://example.supabase.co",
        "/storage/v1/object/upload/sign/xcr8-assets/uploads/demo.jpg?token=abc",
    )

    assert signed_url == "https://example.supabase.co/storage/v1/object/upload/sign/xcr8-assets/uploads/demo.jpg?token=abc"
