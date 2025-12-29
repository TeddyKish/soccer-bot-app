# Deployment

## Docker Compose (recommended)

1. Copy `.env.example` to `.env` and update (the file is ignored by git). Passwords are loaded on every container start:
   - `ADMIN_PASSWORD`
   - `RANKER_PASSWORD`
   - `MONGODB_DB_NAME` (optional)
2. Build and start:

```bash
docker-compose up --build
```

3. Open the app at `http://localhost:8000`.

The MongoDB data is stored in the named volume `mongo_data`, so redeploys will not erase existing data.

Note: Docker only reads `env_file` on container creation. If you change `.env`, recreate the `app` container so the new values are applied.

## Environment Variables

- `MONGODB_URI`: Mongo connection string (default from compose: `mongodb://mongo:27017`)
- `MONGODB_DB_NAME`: Database name (default: `tfab`)
- `ADMIN_PASSWORD`: Password for administrators
- `RANKER_PASSWORD`: Password for rankers
- `SESSION_TTL_MINUTES`: Session TTL (default: `720`)
- `CORS_ORIGINS`: Comma-separated origins for development (optional)
- `PORT`: HTTP port for FastAPI (default: `8000`)

## Frontend Build

The Dockerfile builds the React UI and copies the static bundle to `frontend/dist`. FastAPI serves the bundle directly.
