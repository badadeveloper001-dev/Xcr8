from __future__ import annotations

from types import SimpleNamespace

from app.api.routes import social_publish


class _FakeDB:
    def __init__(self, user, post, variants, connected):
        self.user = user
        self.post = post
        self._scalars = [variants, connected]
        self._scalar_index = 0

    def get(self, model, identifier):
        if identifier == self.user.id:
            return self.user
        if identifier == self.post.id:
            return self.post
        return None

    def scalars(self, _query):
        result = self._scalars[self._scalar_index]
        self._scalar_index += 1
        return result


def test_publish_post_passes_attribution_formatted_caption_to_publisher(monkeypatch):
    user = SimpleNamespace(id=1)
    post = SimpleNamespace(
        id=2,
        user_id=1,
        workspace_id=7,
        content_meta={},
        media_url=None,
        media_type="image",
    )
    variant = SimpleNamespace(
        platform=SimpleNamespace(value="instagram"),
        adapted_caption="Original caption",
        hashtags=[],
        approved=True,
    )
    connection = SimpleNamespace(
        platform=SimpleNamespace(value="instagram"),
        auth_meta={
            "connection_method": "oauth",
            "access_token": "test-token",
            "platform_user_id": "platform-user-1",
        },
        is_active=True,
    )
    db = _FakeDB(user, post, [variant], [connection])

    monkeypatch.setattr(
        social_publish,
        "free_attribution",
        lambda _db, _user: {
            "text": "Published with XCR8",
            "url": "https://xcr8.tech/c/ABC123",
            "public_code": "ABC123",
        },
    )
    monkeypatch.setattr(
        social_publish,
        "format_platform_attribution",
        lambda caption, platform, attribution: (
            f"{caption}\n[{platform}:{attribution.public_code}]"
        ),
    )

    published = {}

    def fake_publish_to_platform(**kwargs):
        published.update(kwargs)
        return {"success": True}

    monkeypatch.setattr(social_publish, "publish_to_platform", fake_publish_to_platform)

    result = social_publish.publish_post(
        social_publish.PublishPostRequest(user_id=1, post_id=2, platforms=["instagram"]),
        db=db,
    )

    assert result["published"] is True
    assert published["caption"] == "Original caption\n[instagram:ABC123]"
    assert published["platform"] == "instagram"
