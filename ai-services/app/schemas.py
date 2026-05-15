from pydantic import BaseModel, Field


class AdaptCaptionRequest(BaseModel):
    text: str
    platform: str
    language: str = "english"
    creator_memory: dict = Field(default_factory=dict)


class AdaptCaptionResponse(BaseModel):
    adapted_caption: str
    hashtags: list[str]
    hook: str
    model: str
