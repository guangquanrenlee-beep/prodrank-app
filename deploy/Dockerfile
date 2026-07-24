FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt pydantic-settings uvicorn supabase
COPY backend/ .
COPY deploy/start.py .
EXPOSE 8080
CMD ["python", "start.py"]
