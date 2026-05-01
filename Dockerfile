# --- Frontend build ---
FROM node:20-alpine AS frontend
WORKDIR /fe
COPY frontend/package.json frontend/package.json
RUN cd frontend && npm install --no-audit --no-fund
COPY frontend ./frontend
RUN cd frontend && npm run build

# --- Backend ---
FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=frontend /fe/frontend/dist /app/static

ENV DATA_PATH=/data/data.json
ENV STATIC_DIR=/app/static
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
