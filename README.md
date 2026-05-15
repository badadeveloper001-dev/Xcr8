# Xcr8

Xcr8 is a premium AI-powered creator distribution platform.

Creators upload content once, and Xcr8 intelligently adapts captions, schedules posts, tracks analytics, and retains creator memory context across platforms.

## Monorepo Structure

```text
.
├── .devcontainer/
├── .vscode/
├── ai-services/
├── apps/
├── backend/
├── docs/
├── frontend/
├── integrations/
├── packages/
├── scripts/
└── shared/
```

## Technology Stack

### Frontend

- Next.js
- TypeScript (strict mode)
- TailwindCSS
- shadcn/ui baseline
- Framer Motion
- Zustand
- TanStack React Query
- Axios

### Backend

- FastAPI
- Uvicorn
- SQLAlchemy
- psycopg2-binary
- python-dotenv
- Supabase Python client
- Pydantic / pydantic-settings

### AI Services

- OpenAI SDK
- LangChain
- pgvector
- pinecone-client
- tiktoken

### Scheduling and Automation

- Celery
- Redis
- APScheduler

## Environment Setup

### 1) Start Infrastructure

```bash
docker compose -f docker-compose.dev.yml up -d
```

### 2) Install Dependencies

```bash
make deps
```

### 3) Configure Environment Variables

Copy templates and fill in values:

- `.env.example` -> `.env`
- `frontend/.env.example` -> `frontend/.env.local`
- `backend/.env.example` -> `backend/.env`
- `ai-services/.env.example` -> `ai-services/.env`

Full variable reference: `docs/environment-variables.md`.

### 4) Run Full Development Mode

```bash
pnpm dev
```

## Common Commands

```bash
# Run one service
pnpm dev:frontend
pnpm dev:backend
pnpm dev:ai
pnpm dev:workers

# Quality
pnpm lint
pnpm typecheck
pnpm format
```

## Codespaces and Devcontainer

The repository includes a production-oriented devcontainer with:

- Node.js LTS
- Python 3.11+
- pnpm via Corepack
- Docker-in-Docker support
- PostgreSQL client tools
- Redis tools

## Architecture Notes

- PostgreSQL-ready and Supabase-compatible service design
- S3-compatible storage abstraction for AWS S3 and Cloudflare R2
- Supabase Auth-ready backend adapter
- Celery workers for distribution and scheduled tasks
- Shared package and schema layers for modular growth

See detailed docs in:

- `docs/architecture.md`
- `docs/development-workflow.md`
- `docs/environment-variables.md`