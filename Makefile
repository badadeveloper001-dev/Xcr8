.PHONY: setup deps infra frontend backend ai workers dev lint typecheck format

setup: deps

deps:
	corepack enable
	pnpm install
	python3 -m venv .venv
	. .venv/bin/activate && pip install -U pip
	. .venv/bin/activate && pip install -r backend/requirements.txt -r ai-services/requirements.txt

infra:
	docker compose -f docker-compose.dev.yml up -d

frontend:
	./scripts/start-frontend.sh

backend:
	./scripts/start-backend.sh

ai:
	./scripts/start-ai-services.sh

workers:
	./scripts/start-workers.sh

dev:
	./scripts/start-dev.sh

lint:
	pnpm lint

typecheck:
	pnpm typecheck

format:
	pnpm format
	. .venv/bin/activate && ruff format backend ai-services integrations
	. .venv/bin/activate && black backend ai-services integrations
