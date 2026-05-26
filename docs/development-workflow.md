# Development Workflow

## Quick Start

1. Copy environment templates and fill secrets.
   - Ensure `OPENAI_API_KEY` is set in `ai-services/.env` or `ai-services/.env.local` for real AI caption generation.
2. Start local infra with Docker Compose.
3. Install dependencies once.
4. Run full development mode.

## Commands

- `make infra`: boot PostgreSQL and Redis
- `make deps`: install frontend and Python dependencies
- `pnpm dev`: run frontend, backend, ai, and worker processes
- `make lint`: run ESLint
- `make typecheck`: run TypeScript checks

## Readiness Checks

- `curl http://localhost:8100/health/provider`: confirms AI provider key/model configuration state
- `curl http://localhost:8000/api/v1/analytics/ai-usage/<user_id>`: shows generation counts, token usage, latency, template version usage, and estimated AI cost

## Service Ports

- frontend: 3000
- backend: 8000
- ai-services: 8100
- postgresql: 5432
- redis: 6379
