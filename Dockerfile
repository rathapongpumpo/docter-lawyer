# Doctor Lawyer (ดอกเตอร์ลอว์เยอร์) - Production Containerfile
# Ultra-lightweight, zero-bloat Python 3.11 container for public cloud demo hosting.

FROM python:3.11-slim

WORKDIR /app

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONUTF8=1 \
    HOST=0.0.0.0 \
    PORT=3000

# Copy application files
COPY backend/ /app/backend/
COPY frontend/ /app/frontend/
COPY docs/ /app/docs/

# Create a non-root user for security
RUN useradd -m -u 1000 appuser && \
    chown -R appuser:appuser /app
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:' + str(__import__('os').environ.get('PORT', 3000)) + '/api/health')" || exit 1

EXPOSE 3000

# Run standalone server
CMD ["python", "-X", "utf8", "backend/main.py"]
