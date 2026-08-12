FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    PORT=8765 \
    LLMSTORM_STATS_DB=/data/site-stats.db \
    LLMSTORM_PUBLIC_MODE=1 \
    LLMSTORM_MAX_CONCURRENCY=500 \
    LLMSTORM_MAX_ACTIVE_TESTS=2

WORKDIR /app

RUN addgroup --system llmstorm \
    && adduser --system --ingroup llmstorm llmstorm \
    && install -d -o llmstorm -g llmstorm /data

COPY requirements.txt ./
RUN pip install --no-cache-dir --requirement requirements.txt

COPY --chown=llmstorm:llmstorm web_app.py load_test_engine.py ./
COPY --chown=llmstorm:llmstorm llmstorm ./llmstorm
COPY --chown=llmstorm:llmstorm static ./static

USER llmstorm
VOLUME ["/data"]
EXPOSE 8765

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.getenv('PORT','8765')+'/api/health', timeout=2)"

CMD ["python", "web_app.py"]
