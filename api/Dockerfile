FROM python:3.12-slim

RUN pip install --no-cache-dir uv

WORKDIR /app

# Dependency layer first for cache hits: code changes must not reinstall deps.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./
COPY seeds ./seeds
COPY start.sh ./
RUN uv sync --frozen --no-dev && chmod +x start.sh

EXPOSE 8000

CMD ["sh", "start.sh"]
