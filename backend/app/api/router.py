from fastapi import APIRouter

from app.api.routes.analytics import router as analytics_router
from app.api.routes.ai import router as ai_router
from app.api.routes.auth import router as auth_router
from app.api.routes.dashboard import router as dashboard_router
from app.api.routes.distribution import router as distribution_router
from app.api.routes.health import router as health_router
from app.api.routes.memory import router as memory_router
from app.api.routes.platforms import router as platforms_router
from app.api.routes.scheduling import router as scheduling_router
from app.api.routes.upload import router as upload_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(auth_router)
api_router.include_router(dashboard_router)
api_router.include_router(distribution_router)
api_router.include_router(scheduling_router)
api_router.include_router(memory_router)
api_router.include_router(analytics_router)
api_router.include_router(ai_router)
api_router.include_router(platforms_router)
api_router.include_router(upload_router)

