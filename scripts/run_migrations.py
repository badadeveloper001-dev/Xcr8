"""Run application database migrations explicitly.

This runner is intentionally separate from FastAPI startup. It applies migration
files in lexical order and records successful migrations in public.schema_migrations.

Production baseline migrations 001 and 002 are recorded by
migrations/20260930_migration_ledger.sql and are therefore skipped once that
ledger exists.

Usage:
    python scripts/run_migrations.py

The DATABASE_URL environment variable must point to the privileged migration
connection. Do not use the Supabase browser/anon credentials.
"""

from __future__ import annotations

import os
import re
from pathlib import Path

import psycopg2


ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS_DIR = ROOT / "migrations"
MIGRATION_RE = re.compile(r"^(?P<version>\d+)_.*\.sql$")
LEGACY_MIGRATION_VERSIONS = {
    "20260925_pulse_usage.sql": "001",
    "20260930_schema_reliability.sql": "002",
}
BASELINE_FILE = "20260930_migration_ledger.sql"


def database_url() -> str:
    value = os.getenv("DATABASE_URL", "").strip()
    if not value:
        raise RuntimeError("DATABASE_URL is required")
    return value


def migration_files() -> list[tuple[str, Path]]:
    files: list[tuple[str, Path]] = []
    seen_versions: set[str] = set()

    for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        if path.name == BASELINE_FILE:
            continue

        version = LEGACY_MIGRATION_VERSIONS.get(path.name)
        if version is None:
            match = MIGRATION_RE.match(path.name)
            if not match:
                continue
            version = match.group("version")

        if version in seen_versions:
            raise RuntimeError(f"Duplicate migration version: {version}")
        seen_versions.add(version)
        files.append((version, path))

    return files


def require_ledger(cur) -> None:
    cur.execute(
        """
        SELECT to_regclass('public.schema_migrations')
        """
    )
    if cur.fetchone()[0] is None:
        raise RuntimeError(
            "public.schema_migrations is missing. Apply the one-time migration "
            "ledger baseline before running application migrations."
        )


def applied_versions(cur) -> set[str]:
    cur.execute("SELECT version FROM public.schema_migrations")
    return {row[0] for row in cur.fetchall()}


def migration_name(path: Path) -> str:
    stem = path.stem
    return stem.split("_", 1)[1] if "_" in stem else stem


def main() -> None:
    migrations = migration_files()
    if not migrations:
        print("No migrations found.")
        return

    with psycopg2.connect(database_url()) as conn:
        # Migration files may contain PostgreSQL statements such as ALTER TYPE
        # that have version-dependent transaction restrictions. Each migration
        # is therefore executed as its own autocommit unit.
        conn.autocommit = True

        with conn.cursor() as cur:
            require_ledger(cur)
            applied = applied_versions(cur)

            for version, path in migrations:
                if version in applied:
                    print(f"SKIP {version}: {path.name}")
                    continue

                sql = path.read_text(encoding="utf-8").strip()
                if not sql:
                    raise RuntimeError(f"Migration {path.name} is empty")

                print(f"APPLY {version}: {path.name}")
                cur.execute(sql)
                cur.execute(
                    """
                    INSERT INTO public.schema_migrations (version, name)
                    VALUES (%s, %s)
                    ON CONFLICT (version) DO NOTHING
                    """,
                    (version, migration_name(path)),
                )

    print("Migration run complete.")


if __name__ == "__main__":
    main()
