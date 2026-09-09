FROM python:3.12-slim

RUN pip install --no-cache-dir uv

WORKDIR /app

COPY pyproject.toml ./
RUN uv sync --no-install-project

COPY . .
RUN uv sync
RUN chmod +x start.sh

EXPOSE 8000

CMD ["sh", "start.sh"]
