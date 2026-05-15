def build_tiktok_payload(caption: str, media_url: str) -> dict[str, str]:
    return {"description": caption, "video_url": media_url}
