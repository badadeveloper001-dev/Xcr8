from app.workers.celery_app import celery_app


@celery_app.task(name="app.workers.tasks.process_distribution_job")
def process_distribution_job(content_id: str, platforms: list[str]) -> dict[str, str | int]:
    return {
        "status": "queued",
        "content_id": content_id,
        "platform_count": len(platforms),
    }
