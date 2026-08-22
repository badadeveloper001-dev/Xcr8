import logging

from openai import OpenAI
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    ai_service_host: str = "0.0.0.0"
    ai_service_port: int = 8100
    openai_api_key: str = ""
    # Automatic model routing: fast, capable default plus deeper reasoning for strategic work.
    openai_model: str = "gpt-5.4-mini"
    openai_high_reasoning_model: str = "gpt-5.4"
    # Automatic reliability fallback for projects without access to a selected GPT-5 model.
    openai_compatibility_model: str = "gpt-4o-mini"
    # Optional secondary provider. Used automatically only after OpenAI calls fail.
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-v4-flash"
    openai_image_model: str = "gpt-image-1"
    openai_tts_model: str = "gpt-4o-mini-tts"
    pinecone_api_key: str = ""
    pinecone_environment: str = "us-east-1-aws"
    database_url: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/xcr8"
    ai_internal_token: str = ""
    oauth_state_secret: str = ""
    cron_secret: str = ""

    model_config = SettingsConfigDict(
        env_file=("ai-services/.env", "ai-services/.env.local", ".env", ".env.local"),
        extra="ignore",
    )


settings = Settings()


logger = logging.getLogger(__name__)


def create_chat_completion(client, **kwargs):
    """Try OpenAI models first, then DeepSeek when every OpenAI attempt fails."""
    primary_model = str(kwargs.get("model") or "").strip()
    primary_error: Exception | None = None

    try:
        return client.chat.completions.create(**kwargs)
    except Exception as exc:
        primary_error = exc
        logger.warning("OpenAI model %s failed: %s", primary_model, exc)

    fallback_model = str(settings.openai_compatibility_model or "").strip()
    if fallback_model and fallback_model != primary_model:
        try:
            fallback_kwargs = dict(kwargs)
            fallback_kwargs["model"] = fallback_model
            return client.chat.completions.create(**fallback_kwargs)
        except Exception as exc:
            logger.warning("OpenAI compatibility model %s failed: %s", fallback_model, exc)

    deepseek_key = str(settings.deepseek_api_key or "").strip()
    if deepseek_key:
        try:
            deepseek_client = OpenAI(
                api_key=deepseek_key,
                base_url=str(settings.deepseek_base_url or "https://api.deepseek.com").strip(),
            )
            deepseek_kwargs = dict(kwargs)
            deepseek_kwargs["model"] = str(settings.deepseek_model or "deepseek-v4-flash").strip()
            logger.info("Retrying failed OpenAI request with DeepSeek fallback.")
            return deepseek_client.chat.completions.create(**deepseek_kwargs)
        except Exception as exc:
            logger.warning("DeepSeek fallback failed: %s", exc)

    if primary_error:
        raise primary_error
    raise RuntimeError("No AI provider is configured.")
