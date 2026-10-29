FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    PYTHAINLP_DATA=/tmp/pythainlp-data
WORKDIR /srv/ai

# Install dependencies first (layer cache), then the source.
COPY pyproject.toml ./
RUN python - <<'PY' > /tmp/reqs.txt
import tomllib
p = tomllib.load(open("pyproject.toml", "rb"))["project"]
print("\n".join(p["dependencies"] + p["optional-dependencies"]["dev"]))
PY
RUN pip install -r /tmp/reqs.txt

COPY . .
RUN useradd --system --uid 10001 --home /srv/ai app && chown -R app /srv/ai
USER app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-keep-alive", "75"]
