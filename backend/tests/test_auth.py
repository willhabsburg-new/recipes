from conftest import ADMIN


def test_everything_requires_login(anon):
    assert anon.get("/api/auth/status").json() == {"needs_setup": True, "user": None}
    assert anon.get("/api/recipes").status_code == 401
    assert anon.get("/api/ingredients/suggest", params={"q": "egg"}).status_code == 401


def test_setup_only_once(client):
    assert client.post("/api/auth/setup", json=ADMIN).status_code == 409
    assert client.get("/api/auth/status").json()["user"]["is_admin"] is True


def test_login_logout(client):
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401
    assert client.post("/api/auth/login", json={"email": "admin@home", "password": "nope"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": " Admin@Home ", "password": ADMIN["password"]}
                       ).status_code == 200
    assert client.get("/api/auth/me").json()["name"] == "Admin"


def test_family_member_permissions(client):
    r = client.post("/api/users", json={"name": "Kid", "email": "kid@home", "password": "kidpassword"})
    assert r.status_code == 201
    client.post("/api/auth/logout")
    client.post("/api/auth/login", json={"email": "kid@home", "password": "kidpassword"})

    # can add recipes and ingredients...
    assert client.post("/api/ingredients", json={"name": "dragon fruit jam", "force": True}).status_code == 201
    # ...but not administer users or merge ingredients
    assert client.get("/api/users").status_code == 403
    assert client.get("/api/ingredients/duplicates").status_code == 403
    assert client.post("/api/ingredients/1/merge", json={"into_id": 2}).status_code == 403


def test_change_password(client):
    assert client.post("/api/auth/password", json={"current_password": "wrong", "new_password": "newpassword1"}
                       ).status_code == 400
    assert client.post("/api/auth/password",
                       json={"current_password": ADMIN["password"], "new_password": "newpassword1"}).status_code == 204
    client.post("/api/auth/logout")
    assert client.post("/api/auth/login", json={"email": "admin@home", "password": "newpassword1"}).status_code == 200


def test_spa_fallback_and_api_404(client):
    assert client.get("/api/nope").status_code == 404
    assert client.get("/recipes/1").status_code == 404  # frontend not built in tests
