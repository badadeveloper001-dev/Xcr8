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
  - caption adaptation uses OpenAI chat completions with platform-aware constraints
  - returns structured output (caption, hook, hashtags) plus model/latency/usage metadata
  - falls back to deterministic local adaptation when provider calls fail
- worker: Celery workers for queue-driven automation
- infra: PostgreSQL and Redis via Docker Compose or managed cloud

## Data and Auth

- PostgreSQL-compatible schema, ready for Supabase Postgres
- Supabase Auth-ready integration points via service-role client
- pgvector-compatible dependency path for semantic memory
- AI generation records persist prompt template version, latency, token usage, and model metadata
- backend analytics exposes `/api/v1/analytics/ai-usage/{user_id}` for AI ops visibility in dashboard

## Storage

- S3-compatible object storage abstraction
- works with AWS S3 and Cloudflare R2 through endpoint configuration
