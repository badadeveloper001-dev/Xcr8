from __future__ import annotations


PLATFORM_LIMITS = {
    "x": 270,
    "linkedin": 3000,
    "instagram": 2200,
    "facebook": 63206,
    "tiktok": 2200,
    "threads": 500,
    "youtube_shorts": 150,
}


def _language_transform(text: str, language: str) -> str:
    lang = language.lower()
    if lang == "nigerian_pidgin":
        return (
            text.replace("you", "you")
            .replace("your", "your")
            .replace("for", "for")
            .replace("is", "na")
        )
    if lang == "yoruba":
        return f"{text} Oya, e je ka gbe e lo!"
    if lang == "code_switch":
        return f"{text} We dey run am live, no dulling."
    return text


def _platform_style(text: str, platform: str) -> tuple[str, str]:
    platform_key = platform.lower()
    if platform_key == "linkedin":
        return (
            f"{text}\n\nKey takeaway:\n- Ship consistently\n- Learn fast\n- Build in public",
            "Creators that document their process grow trust faster.",
        )
    if platform_key == "x":
        return (f"{text}\n\nWhat do you think?", "Hot take: consistency beats perfection every time.")
    if platform_key == "instagram":
        return (
            f"{text}\n.\n.\n.\nSave this for your next content sprint.",
            "Stop scrolling: this one shift changes your creator growth trajectory.",
        )
    if platform_key == "tiktok":
        return (f"POV: {text}", "This is how creators scale faster with less stress.")
    if platform_key == "youtube_shorts":
        return (f"{text}", "3 seconds in and your audience should already care.")
    if platform_key == "threads":
        return (f"{text}\n\nWho else is testing this strategy today?", "Threads rewards native, punchy opinions.")
    return (text, "Lead with value, then invite conversation.")


def _generate_hashtags(platform: str, language: str) -> list[str]:
    base = ["#xcr8", "#creatoros", "#contentstrategy"]
    platform_tag = {
        "instagram": "#instagramcreator",
        "tiktok": "#tiktokcreator",
        "x": "#xcreator",
        "linkedin": "#linkedincreator",
        "facebook": "#facebookcreator",
        "youtube_shorts": "#shortscreator",
        "threads": "#threadscreator",
    }.get(platform, "#creator")

    language_tag = {
        "english": "#contentenglish",
        "nigerian_pidgin": "#naijacreator",
        "yoruba": "#yorubacreator",
        "code_switch": "#afrodigital",
    }.get(language, "#globalcreator")

    return [platform_tag, language_tag, *base]


def adapt_caption(text: str, platform: str, language: str, creator_memory: dict) -> dict:
    language_mapped = _language_transform(text.strip(), language)
    platform_caption, hook = _platform_style(language_mapped, platform)

    tone = creator_memory.get("tone", "confident")
    emoji_style = creator_memory.get("emoji_style", "🔥")
    styled_caption = f"{platform_caption}\n\nTone: {tone} {emoji_style}".strip()

    limit = PLATFORM_LIMITS.get(platform, 2200)
    adapted_caption = styled_caption[:limit]

    return {
        "adapted_caption": adapted_caption,
        "hashtags": _generate_hashtags(platform, language),
        "hook": hook,
    }

