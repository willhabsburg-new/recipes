from conftest import ingredient_id, make_recipe


def test_crud_and_text_search(client):
    r = client.post("/api/recipes", json={
        "title": "Roasted Broccoli", "description": "Crispy edges", "instructions": "Roast at 425F.",
        "servings": 4, "prep_minutes": 5, "cook_minutes": 20, "tags": ["Side", "vegetarian", "side"],
        "lines": [
            {"ingredient_id": ingredient_id(client, "broccoli"), "quantity": 1, "unit": "lb", "note": "florets"},
            {"ingredient_id": ingredient_id(client, "olive oil"), "quantity": 2, "unit": "tbsp"},
        ],
    })
    assert r.status_code == 201, r.text
    recipe = r.json()
    assert recipe["tags"] == ["side", "vegetarian"]
    assert recipe["total_minutes"] == 25
    assert [ln["ingredient"]["name"] for ln in recipe["lines"]] == ["broccoli", "olive oil"]

    # full-text search covers title, instructions and ingredient names, with prefixes
    for q in ("roast", "425f", "brocc", "olive", "crispy"):
        assert [x["title"] for x in client.get("/api/recipes", params={"q": q}).json()] == ["Roasted Broccoli"], q
    assert client.get("/api/recipes", params={"q": "chocolate"}).json() == []
    assert len(client.get("/api/recipes", params={"tag": "side"}).json()) == 1

    recipe_id = recipe["id"]
    r = client.put(f"/api/recipes/{recipe_id}", json={
        "title": "Roasted Cauliflower", "tags": ["side"],
        "lines": [{"ingredient_id": ingredient_id(client, "cauliflower")}],
    })
    assert r.status_code == 200
    assert client.get("/api/recipes", params={"q": "broccoli"}).json() == []
    assert [t["name"] for t in client.get("/api/tags").json()] == ["side"]  # unused tag pruned

    assert client.delete(f"/api/recipes/{recipe_id}").status_code == 204
    assert client.get(f"/api/recipes/{recipe_id}").status_code == 404
    assert client.get("/api/recipes", params={"q": "cauliflower"}).json() == []


def test_unknown_ingredient_or_unit_rejected(client):
    assert client.post("/api/recipes", json={"title": "x", "lines": [{"ingredient_id": 999999}]}).status_code == 422
    egg = ingredient_id(client, "egg")
    assert client.post("/api/recipes", json={"title": "x", "lines": [{"ingredient_id": egg, "unit": "bucket"}]}
                       ).status_code == 422


def test_photo_upload(client, settings):
    recipe = make_recipe(client, "Toast", ["bread"])
    png = b"\x89PNG\r\n\x1a\n" + b"\0" * 32
    r = client.post(f"/api/recipes/{recipe['id']}/photo", files={"file": ("t.png", png, "image/png")})
    assert r.status_code == 200
    url = r.json()["photo_url"]
    assert client.get(url).content == png
    assert client.post(f"/api/recipes/{recipe['id']}/photo",
                       files={"file": ("t.txt", b"hi", "text/plain")}).status_code == 415
    client.delete(f"/api/recipes/{recipe['id']}")
    assert not list(settings.photos_dir.iterdir())
