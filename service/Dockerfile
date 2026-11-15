# Planning service image for a hosted deployment (Azure Container Apps).
# Build from the repository root:  docker build -f service/Dockerfile .
# Requires the generated analytical package (python -m scripts.prepare_gale) in the build context.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv

COPY engine/requirements.txt engine/requirements.txt
COPY service/requirements.txt service/requirements.txt
RUN pip install --no-cache-dir -r service/requirements.txt

COPY engine/ engine/
COPY service/ service/
COPY data/processed/gale/analytical/ data/processed/gale/analytical/
COPY data/processed/gale/environment/ data/processed/gale/environment/
COPY data/processed/gale/material/ data/processed/gale/material/
COPY data/processed/ml/forecasts/ data/processed/ml/forecasts/

# ALLOWED_ORIGIN: the exact HTTPS origin of the hosted app (e.g. https://name.z13.web.core.windows.net).
ENV ALLOWED_ORIGIN=http://localhost:5173
EXPOSE 8000
RUN useradd --create-home --uid 10001 app
USER app
CMD ["sh", "-c", "exec python -m service --host 0.0.0.0 --port 8000 --gale-package data/processed/gale/analytical/manifest.json --allow-origin \"$ALLOWED_ORIGIN\""]
