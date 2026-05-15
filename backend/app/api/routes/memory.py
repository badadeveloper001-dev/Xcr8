from fastapi import APIRouter, Depends
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.db.models import CreatorMemory
from app.schemas.mvp import MemoryWriteRequest
from app.services.memory_vector import build_vector_memory_config

router = APIRouter(prefix="/memory", tags=["memory"])


@router.post("/write")
def write_memory(payload: MemoryWriteRequest, db: Session = Depends(get_db)) -> dict:
    memory = CreatorMemory(
        user_id=payload.user_id,
        memory_type=payload.memory_type,
        memory_key=payload.memory_key,
        memory_value=payload.memory_value,
        confidence_score=payload.confidence_score,
    )
    db.add(memory)
    db.commit()
    db.refresh(memory)

    return {
        "memory_id": memory.id,
        "memory_key": memory.memory_key,
        "confidence_score": memory.confidence_score,
    }


@router.get("/profile/{user_id}")
def memory_profile(user_id: int, db: Session = Depends(get_db)) -> dict:
    memories = db.scalars(
        select(CreatorMemory)
        .where(CreatorMemory.user_id == user_id)
        .order_by(desc(CreatorMemory.created_at))
        .limit(20)
    )
    vector_config = build_vector_memory_config()

    return {
        "items": [
            {
                "memory_type": item.memory_type,
                "memory_key": item.memory_key,
                "memory_value": item.memory_value,
                "confidence_score": item.confidence_score,
            }
            for item in memories
        ],
        "vector_memory": {
            "provider": vector_config.provider,
            "index_name": vector_config.index_name,
            "embedding_model": vector_config.embedding_model,
        },
    }
