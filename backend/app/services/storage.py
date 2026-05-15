from __future__ import annotations

import boto3

from app.core.config import settings


def get_storage_client():
    # Cloudflare R2 is S3-compatible, so the same client works with endpoint_url.
    return boto3.client(
        "s3",
        region_name=settings.storage_region,
        aws_access_key_id=settings.storage_access_key_id,
        aws_secret_access_key=settings.storage_secret_access_key,
        endpoint_url=settings.storage_endpoint_url,
    )
