def build_instagram_payload(caption: str, media_url: str) -> dict[str, str]:
    return {"caption": caption, "media_url": media_url}
