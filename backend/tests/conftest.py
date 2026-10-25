import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

ADMIN = {"name": "Admin", "email": "admin@home", "password": "password123"}


@pytest.fixture
def settings(tmp_path):
    return Settings(data_dir=tmp_path, database_url=f"sqlite:///{tmp_path / 'test.db'}",
                    frontend_dist=tmp_path / "no-dist", cookie_secure=False)


@pytest.fixture
def anon(settings):
    with TestClient(create_app(settings)) as c:
        yield c


@pytest.fixture
def client(anon):
    """Signed in as the admin created during first-run setup."""
    assert anon.post("/api/auth/setup", json=ADMIN).status_code == 201
    return anon


def ingredient_id(client, name: str) -> int:
    r = client.get("/api/ingredients/check", params={"name": name}).json()
    assert r["exact"], f"{name!r} is not a known ingredient"
    return r["exact"]["id"]


def make_recipe(client, title: str, ingredients: list[str], optional: list[str] = (), tags: list[str] = ()) -> dict:
    lines = [{"ingredient_id": ingredient_id(client, n)} for n in ingredients]
    lines += [{"ingredient_id": ingredient_id(client, n), "optional": True} for n in optional]
    r = client.post("/api/recipes", json={"title": title, "lines": lines, "tags": list(tags)})
    assert r.status_code == 201, r.text
    return r.json()
