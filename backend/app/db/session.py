import os
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings


class Base(DeclarativeBase):
    pass


# Vercel serverless functions are short-lived; using a connection pool causes
# Supabase Postgres to run out of connections quickly.  NullPool creates and
# closes a fresh connection per request, which is the correct pattern for
# serverless.  SQLite keeps check_same_thread disabled for local dev.
if settings.database_url.startswith("postgresql"):
    postgres_options = {
        "pool_pre_ping": True,
        "connect_args": {"connect_timeout": 10, "options": "-c timezone=UTC"},
    }
    if os.getenv("VERCEL"):
        # Serverless instances should not retain database connections.
        postgres_options["poolclass"] = NullPool
    else:
        # Render is long-running. Reusing a small bounded pool avoids paying a
        # fresh TLS/Postgres connection cost on every request.
        postgres_options.update(pool_size=5, max_overflow=5, pool_recycle=300)
    engine = create_engine(settings.database_url, **postgres_options)
else:
    engine = create_engine(
        settings.database_url,
        pool_pre_ping=True,
        connect_args={"check_same_thread": False},
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
