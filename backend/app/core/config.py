import os
import socket
import tempfile
from urllib.parse import urlencode

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

    ai_service_url: str = "http://localhost:8100"
    default_timezone: str = "Africa/Lagos"

    storage_provider: str = "s3"
    storage_bucket: str = "xcr8-assets"
    storage_region: str = "us-east-1"
    storage_access_key_id: str = ""
    storage_secret_access_key: str = ""
    storage_endpoint_url: str | None = None

    model_config = SettingsConfigDict(env_file=(".env", ".env.local"), extra="ignore")

    @model_validator(mode="after")
    def _ensure_database_url(self) -> "Settings":
        if self.database_url:
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
            return self

        # In serverless runtimes (e.g. Vercel), writeable storage is limited to /tmp.
        # Use a temp-backed SQLite fallback when managed DB credentials are not configured.
        fallback_db_path = os.path.join(tempfile.gettempdir(), "xcr8.dev.db")
        self.database_url = f"sqlite:///{fallback_db_path}"
        return self


settings = Settings()
