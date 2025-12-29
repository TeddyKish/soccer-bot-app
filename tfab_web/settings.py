import os
from dataclasses import dataclass
from pathlib import Path

def _parse_csv(value):
    if not value:
        return ()
    return tuple(item.strip() for item in value.split(",") if item.strip())


BASE_DIR = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class Settings:
    app_name: str = "TFAB Web"
    mongodb_uri: str = os.getenv("MONGODB_URI", "")
    mongodb_db_name: str = os.getenv("MONGODB_DB_NAME", "tfab")
    mongodb_host: str = os.getenv("MONGODB_HOST", "localhost")
    mongodb_port: int = int(os.getenv("MONGODB_PORT", "27017"))
    admin_password: str = os.getenv("ADMIN_PASSWORD", "admin")
    ranker_password: str = os.getenv("RANKER_PASSWORD", "ranker")
    session_ttl_minutes: int = int(os.getenv("SESSION_TTL_MINUTES", "720"))
    cors_origins: tuple = _parse_csv(os.getenv("CORS_ORIGINS", ""))
    static_root: Path = Path(os.getenv("FRONTEND_DIST", BASE_DIR / "frontend" / "dist"))
