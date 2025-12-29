# Soccer Management Web App

A web-based, Hebrew, RTL application for managing soccer match rosters, rankings, and team generation. It preserves the original Python logic (message parsing, team generation, rating aggregation) while providing a modern React UI.

## Highlights

- Hebrew UI with RTL layout
- Separate Admin and Ranker experiences
- WhatsApp message parsing for matchday imports (now via UI)
- Linear-programming team generation remains intact
- Brute-force protection on login (5 attempts / 5 minutes)
- Dockerized with MongoDB persisted on a dedicated volume

## Quick Start (Docker)

```bash
cp .env.example .env
docker-compose up --build
```

Open `http://localhost:8000`.

Default credentials live in `.env` and are loaded on every container start. After changing `.env`, recreate the app container so Docker re-reads the file.

## Local Development

Backend:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn tfab_web.app:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` to the backend.

## Deployment

See `docs/deployment.md` for deployment instructions and environment variables.

## Testing

```bash
pytest
```

Message parsing tests live in `tests/test_message_parsing.py`.
