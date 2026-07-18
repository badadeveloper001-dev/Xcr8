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
    engine = create_engine(
        settings.database_url,
        poolclass=NullPool,
        pool_pre_ping=True,
        connect_args={"connect_timeout": 10, "options": "-c timezone=UTC"},
    )
else:
    engine = create_engine(
        settings.database_url,
        pool_pre_ping=True,
        connect_args={"check_same_thread": False},
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
