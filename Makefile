.PHONY: up down test lint migrate

up:
	docker compose up --build

down:
	docker compose down

test:
	cd api && uv run pytest

lint:
	cd api && uv run ruff check . && uv run ruff format --check . && uv run mypy app

migrate:
	cd api && uv run alembic upgrade head
