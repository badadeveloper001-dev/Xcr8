import os
import socket
import tempfile
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    environment: str = "development"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    database_url: str = ""
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"

    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""
    supabase_db_password: str = ""
    supabase_db_project_ref: str = ""
    supabase_db_host: str = ""
    supabase_db_port: int = 5432
    google_oauth_enabled: bool = True

    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_from_name: str = "XCR8"
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False
    signup_code_ttl_minutes: int = 10
    admin_access_code: str = ""
    founder_alert_emails: str = ""
    pulse_slack_webhook_url: str = ""
    pulse_discord_webhook_url: str = ""
    pulse_internal_token: str = ""
    pulse_slow_request_ms: int = 6000
    pulse_user_email_enabled: bool = False
    cron_secret: str = ""
    oauth_state_secret: str = ""
    ai_internal_token: str = ""
    billing_webhook_secret: str = ""
    # Paystack stays in test mode until explicitly switched off for live payments.
    paystack_secret_key: str = ""
    paystack_currency: str = "AUTO"
    paystack_test_mode: bool = True
    paystack_base_url: str = "https://api.paystack.co"

    ai_service_url: str = "http://localhost:8100"
    default_timezone: str = "Africa/Lagos"

    # Platform OAuth credentials
    meta_app_id: str = ""
    meta_app_secret: str = ""
    twitter_client_id: str = ""
    twitter_client_secret: str = ""
    linkedin_client_id: str = ""
    linkedin_client_secret: str = ""
    tiktok_client_key: str = ""
    tiktok_client_secret: str = ""
    google_client_id: str = ""
    google_client_secret: str = ""
    # Optional YouTube Data API key for niche trend discovery.
    youtube_api_key: str = ""
    threads_app_id: str = ""
    threads_app_secret: str = ""

    # Public frontend URL used for OAuth redirect_uri construction
    frontend_url: str = ""

    storage_provider: str = "s3"
    storage_bucket: str = "xcr8-assets"
    storage_region: str = "us-east-1"
    storage_access_key_id: str = ""
    storage_secret_access_key: str = ""
    storage_endpoint_url: str | None = None

    model_config = SettingsConfigDict(
        env_file=(
            Path(__file__).resolve().parents[2] / ".env",
            Path(__file__).resolve().parents[2] / ".env.local",
            ".env",
            ".env.local",
        ),
        extra="ignore",
    )

    @staticmethod
    def _resolve_vercel_base_url() -> str | None:
        raw = os.getenv("VERCEL_PROJECT_PRODUCTION_URL") or os.getenv("VERCEL_URL")
        if not raw:
            return None
        candidate = raw.strip()
        if not candidate:
            return None
        if not candidate.startswith("http://") and not candidate.startswith("https://"):
            candidate = f"https://{candidate}"
        return candidate.rstrip("/")

    @staticmethod
    def _inject_ipv4_hostaddr_if_possible(database_url: str) -> str:
        if not database_url.startswith("postgresql") or "hostaddr=" in database_url:
            return database_url

        try:
            parsed = urlsplit(database_url)
            hostname = parsed.hostname
            if not hostname:
                return database_url

            ipv4_info = socket.getaddrinfo(hostname, None, socket.AF_INET)
            if not ipv4_info:
                return database_url

            hostaddr = ipv4_info[0][4][0]
            query_pairs = dict(parse_qsl(parsed.query, keep_blank_values=True))
            query_pairs.setdefault("sslmode", "require")
            query_pairs["hostaddr"] = hostaddr
            new_query = urlencode(query_pairs)
            return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, new_query, parsed.fragment))
        except OSError:
            return database_url

    @model_validator(mode="after")
    def _ensure_database_url(self) -> "Settings":
        vercel_base = self._resolve_vercel_base_url()

        if not self.frontend_url.strip() and vercel_base:
            self.frontend_url = vercel_base

        if self.ai_service_url.strip() in {"", "http://localhost:8100"}:
            if vercel_base:
                self.ai_service_url = f"{vercel_base}/_/ai-services"

        if self.database_url:
            self.database_url = self._inject_ipv4_hostaddr_if_possible(self.database_url)
            return self

        if self.supabase_db_project_ref and self.supabase_db_password:
            resolved_host = self.supabase_db_host or f"db.{self.supabase_db_project_ref}.supabase.co"
            query_params: dict[str, str] = {"sslmode": "require"}

            try:
                ipv4_info = socket.getaddrinfo(resolved_host, None, socket.AF_INET)
                if ipv4_info:
                    query_params["hostaddr"] = ipv4_info[0][4][0]
            except OSError:
                # If IPv4 resolution fails, keep default hostname-based connection behavior.
                pass

            query_string = urlencode(query_params)
            self.database_url = (
                "postgresql+psycopg2://postgres:"
                f"{self.supabase_db_password}@{resolved_host}:{self.supabase_db_port}/postgres?{query_string}"
            )
            self.database_url = self._inject_ipv4_hostaddr_if_possible(self.database_url)
            return self

        if os.getenv("VERCEL") or self.environment.strip().lower() == "production":
            raise ValueError(
                "Production database configuration is missing. Set DATABASE_URL or Supabase DB credentials."
            )

        backend_dir = Path(__file__).resolve().parents[2]
        fallback_db_path = backend_dir / "xcr8.dev.db"
        self.database_url = f"sqlite:///{fallback_db_path}"
        return self


settings = Settings()
