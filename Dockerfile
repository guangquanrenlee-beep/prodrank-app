FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --no-deps -r requirements.txt pydantic-settings uvicorn supabase 2>/dev/null; pip install --no-cache-dir fastapi uvicorn httpx beautifulsoup4 lxml pydantic python-dotenv sqlalchemy asyncpg openai supabase redis pydantic-settings curl_cffi paramiko
COPY backend/ .
COPY inject/ /app/inject/
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
