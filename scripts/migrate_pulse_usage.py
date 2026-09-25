"""Explicit additive migration. Run from repository root with DATABASE_URL set.

No startup DDL; PostgreSQL RLS denies browser roles access to all cockpit tables.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import text
from shared import pulse_usage as ledger


def migrate(engine):
    with engine.begin() as conn:
        if conn.dialect.name == "postgresql":
            conn.execute(text("SELECT pg_advisory_xact_lock(817432901)"))
        ledger.metadata.create_all(conn)
        if conn.execute(ledger.select(ledger.policy.c.id)).first() is None:
            conn.execute(ledger.insert(ledger.policy).values(id=1, revision=0, config=ledger.DEFAULT_CONFIG))
        if conn.dialect.name == "postgresql":
            for name in ledger.metadata.tables:
                conn.execute(text(f'ALTER TABLE "{name}" ENABLE ROW LEVEL SECURITY'))
                conn.execute(text(f'REVOKE ALL ON TABLE "{name}" FROM anon, authenticated'))
    print("Pulse usage migration 001 applied (idempotent).")


if __name__ == "__main__":
    migrate(ledger.engine())
