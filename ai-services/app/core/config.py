from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    ai_service_host: str = "0.0.0.0"
    ai_service_port: int = 8100
    openai_api_key: str = ""
    # Automatic model routing: fast, capable default plus deeper reasoning for strategic work.
    openai_model: str = "gpt-5.4-mini"
    openai_high_reasoning_model: str = "gpt-5.4"
    openai_image_model: str = "gpt-image-1"
    pinecone_api_key: str = ""
    pinecone_environment: str = "us-east-1-aws"
    database_url: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/xcr8"

    model_config = SettingsConfigDict(
        env_file=("ai-services/.env", "ai-services/.env.local", ".env", ".env.local"),
        extra="ignore",
    )


settings = Settings()
