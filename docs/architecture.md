# Xcr8 Architecture

## Core Principles

- modular services with clear ownership
- shared contracts for consistent data flow
- async-first architecture for content scheduling and distribution
- provider-agnostic storage and auth integration

## Runtime Services

- frontend: Next.js application for creator workspace
- backend: FastAPI API gateway and business logic
- ai-services: FastAPI AI adaptation and memory intelligence
- worker: Celery workers for queue-driven automation
- infra: PostgreSQL and Redis via Docker Compose or managed cloud

## Data and Auth

- PostgreSQL-compatible schema, ready for Supabase Postgres
- Supabase Auth-ready integration points via service-role client
- pgvector-compatible dependency path for semantic memory

## Storage

- S3-compatible object storage abstraction
- works with AWS S3 and Cloudflare R2 through endpoint configuration
