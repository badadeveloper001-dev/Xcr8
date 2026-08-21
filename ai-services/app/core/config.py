import logging

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
    openai_image_model: str = "gpt-image-1"
    pinecone_api_key: str = ""
    pinecone_environment: str = "us-east-1-aws"
    database_url: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/xcr8"

    model_config = SettingsConfigDict(
        env_file=("ai-services/.env", "ai-services/.env.local", ".env", ".env.local"),
        extra="ignore",
    )


settings = Settings()


logger = logging.getLogger(__name__)


def create_chat_completion(client, **kwargs):
    """Use the selected model, then transparently retry on a broadly available model."""
    primary_model = str(kwargs.get("model") or "").strip()
    try:
        return client.chat.completions.create(**kwargs)
    except Exception as primary_error:
        fallback_model = str(settings.openai_compatibility_model or "").strip()
        if not fallback_model or fallback_model == primary_model:
            raise
        logger.warning(
            "OpenAI model %s failed; retrying with compatibility model %s: %s",
            primary_model,
            fallback_model,
            primary_error,
        )
        fallback_kwargs = dict(kwargs)
        fallback_kwargs["model"] = fallback_model
        return client.chat.completions.create(**fallback_kwargs)
