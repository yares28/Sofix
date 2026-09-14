FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY requirements.lock .
RUN pip install --no-cache-dir -r requirements.lock

COPY . .
# Unprivileged user; it owns only the folders the jobs write to (CSV cache, reports, artifacts).
RUN useradd --create-home --uid 10001 app \
    && mkdir -p data/raw reports artifacts \
    && chown -R app:app data reports artifacts
USER app

EXPOSE 8000
# 0.0.0.0 inside the container; compose publishes it on 127.0.0.1 only.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
