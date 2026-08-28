# DJIHS static model inference service (FastAPI).
# Build context is this directory:  docker build -t djihs-ml ./ml
FROM python:3.12-slim

# libgomp1 is the OpenMP runtime required by xgboost and catboost wheels.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    ARTIFACT_DIR=/tmp/artifacts \
    PORT=8000

WORKDIR /app

# Dependency layer: cached until requirements.txt changes.
# xgboost pulls ~450 MB of CUDA libraries on linux/amd64 that CPU inference
# never uses; drop them to keep the image lean.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && pip uninstall -y nvidia-nccl-cu12 2>/dev/null || true

# Application code.
COPY . .

# Run as an unprivileged user; /tmp/artifacts is the writable model cache.
RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /tmp/artifacts \
    && chown -R appuser:appuser /app /tmp/artifacts
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
    CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.getenv('PORT','8000')+'/health', timeout=4)"

# Shell form so ${PORT} injected by Cloud Run / Render / Railway is expanded.
# `exec` keeps uvicorn as PID 1 for correct signal handling.
CMD exec uvicorn service:app --host 0.0.0.0 --port ${PORT:-8000}
