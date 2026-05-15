# Development Workflow

## Quick Start

1. Copy environment templates and fill secrets.
2. Start local infra with Docker Compose.
3. Install dependencies once.
4. Run full development mode.

## Commands

- `make infra`: boot PostgreSQL and Redis
- `make deps`: install frontend and Python dependencies
- `pnpm dev`: run frontend, backend, ai, and worker processes
- `make lint`: run ESLint
- `make typecheck`: run TypeScript checks

## Service Ports

- frontend: 3000
- backend: 8000
- ai-services: 8100
- postgresql: 5432
- redis: 6379
