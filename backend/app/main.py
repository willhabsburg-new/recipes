import mimetypes
from contextlib import asynccontextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

from .config import BACKEND_DIR, Settings, get_settings
from .db import init_engine, session_factory
from .routers import auth, ingredients, recipes, search
from .seed.seed import seed_ingredients
from .services import fts
from .services.matcher import matcher

mimetypes.add_type("application/manifest+json", ".webmanifest")


def run_migrations(database_url: str) -> None:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", database_url)
    cfg.attributes["skip_logging_config"] = True
    command.upgrade(cfg, "head")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        init_engine(settings.database_url)
        run_migrations(settings.database_url)
        with session_factory() as db:
            seed_ingredients(db)
            fts.reindex_all(db)
        matcher.invalidate()
        yield

    app = FastAPI(title="Will's Recipes", lifespan=lifespan)
    app.state.settings = settings
    for r in (auth.router, ingredients.router, recipes.router, search.router):
        app.include_router(r, prefix="/api")

    dist = settings.frontend_dist

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str):
        """Serve the built PWA; unknown paths get index.html so client-side routes work."""
        if path == "api" or path.startswith("api/"):
            raise HTTPException(404, "Not found")
        index = dist / "index.html"
        if not index.is_file():
            raise HTTPException(404, "Frontend not built: run `make build`")
        target = (dist / path).resolve()
        if path and target.is_file() and target.is_relative_to(dist.resolve()):
            # hashed assets never change; everything else (index.html, sw.js) must revalidate
            immutable = Path(path).parts[0] == "assets"
            cache = "public, max-age=31536000, immutable" if immutable else "no-cache"
            return FileResponse(target, headers={"Cache-Control": cache})
        return FileResponse(index, headers={"Cache-Control": "no-cache"})

    return app


app = create_app()
