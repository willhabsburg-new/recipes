import os
from dataclasses import dataclass
from pathlib import Path

from fastapi import Request

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    database_url: str
    frontend_dist: Path
    cookie_secure: bool
    session_days: int = 90

    @property
    def photos_dir(self) -> Path:
        return self.data_dir / "photos"


def get_settings() -> Settings:
    data_dir = Path(os.environ.get("RECIPE_DATA_DIR", BACKEND_DIR / "data"))
    return Settings(
        data_dir=data_dir,
        database_url=os.environ.get("RECIPE_DATABASE_URL", f"sqlite:///{data_dir / 'recipes.db'}"),
        frontend_dist=Path(os.environ.get("RECIPE_FRONTEND_DIST", PROJECT_DIR / "frontend" / "dist")),
        cookie_secure=os.environ.get("RECIPE_COOKIE_SECURE", "false").lower() in ("1", "true", "yes"),
    )


def app_settings(request: Request) -> Settings:
    return request.app.state.settings
