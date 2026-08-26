from urllib.parse import parse_qs, urlparse

from app.api.routes.intelligence import _matches_niche, _profile_interests
from app.core.config import settings
from app.db.models import CreatorProfile
from app.services import social_publisher


class _FakeResponse:
    def __init__(self, payload: dict, status_code: int = 200):
        self._payload = payload
        self.status_code = status_code
        self.headers = {"content-type": "application/json"}
        self.text = str(payload)

    def json(self) -> dict:
        return self._payload


class _FakeMetaClient:
    def __init__(self, *args, **kwargs):
        self.calls = 0

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def get(self, url: str, params=None):
        if url.endswith("/me/accounts"):
            return _FakeResponse(
                {
                    "data": [{"id": "page-1", "name": "First", "access_token": "page-token-1"}],
                    "paging": {"next": "https://meta.test/page-2"},
                }
            )
        if url == "https://meta.test/page-2":
            return _FakeResponse(
                {
                    "data": [
                        {
                            "id": "page-2",
                            "name": "Niche Brand",
                            "access_token": "page-token-2",
                            "instagram_business_account": {
                                "id": "ig-42",
                                "username": "nichecreator",
                            },
                        }
                    ]
                }
            )
        if url.endswith("/me") and params and str(params.get("fields", "")).startswith("accounts."):
            return _FakeResponse({})
        return _FakeResponse({}, status_code=404)


def test_instagram_resolver_follows_meta_account_pagination(monkeypatch):
    monkeypatch.setattr(social_publisher.httpx, "Client", _FakeMetaClient)

    resolved = social_publisher.fetch_instagram_business_connection("user-token")

    assert resolved is not None
    assert resolved["ig_user_id"] == "ig-42"
    assert resolved["ig_username"] == "nichecreator"
    assert resolved["page_access_token"] == "page-token-2"
    assert resolved["resolution_source"] == "accounts-edge"


def test_instagram_oauth_rerequests_required_permissions(monkeypatch):
    monkeypatch.setattr(settings, "meta_app_id", "meta-app-id")
    monkeypatch.setattr(settings, "meta_app_secret", "meta-app-secret")
    monkeypatch.setattr(settings, "oauth_state_secret", "state-secret")

    url = social_publisher.get_oauth_authorize_url(
        "instagram",
        user_id=7,
        redirect_uri="https://xcr8.example/auth/platform-callback",
    )

    assert url is not None
    query = parse_qs(urlparse(url).query)
    assert social_publisher.META_GRAPH_VERSION == "v22.0"
    assert query["auth_type"] == ["rerequest"]
    assert query["return_scopes"] == ["true"]
    scopes = set(query["scope"][0].split(","))
    assert {
        "instagram_basic",
        "instagram_content_publish",
        "pages_show_list",
        "pages_read_engagement",
    }.issubset(scopes)


def test_profile_interests_are_saved_niches_only():
    profile = CreatorProfile(
        user_id=1,
        niche="Technology & AI",
        preferences={
            "content_niche": ["Technology & AI", "Personal Finance"],
            "content_goals": ["grow followers"],
        },
    )

    assert _profile_interests(profile) == ["technology & ai", "personal finance"]
    assert _matches_niche("New AI tools for independent creators", _profile_interests(profile))
    assert _matches_niche("Mortgage rates and personal finance changes", _profile_interests(profile))
    assert not _matches_niche("Premier League transfer news", _profile_interests(profile))
    assert _profile_interests(None) == []



class _FakeInstagramPublishClient:
    def __init__(self, *args, **kwargs):
        self.status_reads = 0
        self.publish_status_reads: list[int] = []

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def get(self, url: str, params=None):
        self.status_reads += 1
        status = "IN_PROGRESS" if self.status_reads == 1 else "FINISHED"
        return _FakeResponse({"id": "container-1", "status_code": status})

    def post(self, url: str, params=None):
        if url.endswith("/media_publish"):
            self.publish_status_reads.append(self.status_reads)
            return _FakeResponse({"id": "published-media-1"})
        if url.endswith("/media"):
            return _FakeResponse({"id": "container-1"})
        return _FakeResponse({}, status_code=404)


def test_instagram_publish_waits_until_media_is_finished(monkeypatch):
    client = _FakeInstagramPublishClient()
    monkeypatch.setattr(social_publisher.httpx, "Client", lambda *args, **kwargs: client)
    monkeypatch.setattr(social_publisher, "sleep", lambda *_args: None)

    result = social_publisher._post_instagram(
        "access-token",
        "A useful caption",
        "https://cdn.example/photo.jpg",
        "ig-user-1",
        "image",
    )

    assert result["success"] is True
    assert result["post_id"] == "published-media-1"
    assert client.status_reads == 2
    assert client.publish_status_reads == [2]


class _FakeNeverReadyClient(_FakeInstagramPublishClient):
    def get(self, url: str, params=None):
        self.status_reads += 1
        return _FakeResponse({"id": "container-1", "status_code": "IN_PROGRESS"})


def test_instagram_publish_does_not_publish_an_unready_container(monkeypatch):
    client = _FakeNeverReadyClient()
    monkeypatch.setattr(social_publisher.httpx, "Client", lambda *args, **kwargs: client)
    monkeypatch.setattr(social_publisher, "sleep", lambda *_args: None)

    result = social_publisher._post_instagram(
        "access-token",
        "A useful caption",
        "https://cdn.example/photo.jpg",
        "ig-user-1",
        "image",
    )

    assert result["success"] is False
    assert "still processing" in result["error"].lower()
    assert client.publish_status_reads == []
