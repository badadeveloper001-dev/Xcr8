from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class VectorMemoryConfig:
    provider: str
    index_name: str
    embedding_model: str


def build_vector_memory_config() -> VectorMemoryConfig:
    # MVP: return architecture-level config. Runtime indexing can use pgvector or pinecone.
    return VectorMemoryConfig(
        provider="pgvector",
        index_name="creator_memory_embeddings",
        embedding_model="text-embedding-3-small",
    )
