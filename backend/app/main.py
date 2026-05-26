from contextlib import asynccontextmanager

import logging

from fastapi import FastAPI

from app.api.router import api_router
from app.core.config import settings
from app.db import models
from app.db.session import engine

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        models.Base.metadata.create_all(bind=engine)
        logger.info("Database schema initialized successfully.")
    except Exception as exc:
        logger.warning("Database schema creation failed (will retry on first request): %s", exc)
    yield


app = FastAPI(title="Xcr8 Backend", version="0.1.0", lifespan=lifespan)
app.include_router(api_router, prefix="/api/v1")


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "backend", "environment": settings.environment}
