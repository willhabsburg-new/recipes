from conftest import ingredient_id, make_recipe


def suggest(client, q):
    return [s["ingredient"]["name"] for s in client.get("/api/ingredients/suggest", params={"q": q}).json()]


def test_misspellings_suggest_broccoli_first(client):
    for typo in ("brocoli", "brocolli", "broccolis", "broc", "Broccoli"):
        assert suggest(client, typo)[0] == "broccoli", typo


def test_aliases_resolve_to_canonical(client):
    assert suggest(client, "scallions")[0] == "green onion"
    assert suggest(client, "garbanzo beans")[0] == "chickpea"


def test_check_offers_did_you_mean(client):
    r = client.get("/api/ingredients/check", params={"name": "brocolli"}).json()
    assert r["exact"] is None
    assert r["suggestions"][0]["ingredient"]["name"] == "broccoli"


def test_create_returns_existing_for_known_name(client):
    r = client.post("/api/ingredients", json={"name": "Tomatoes"})
    assert r.status_code == 200
    assert r.json() == {"ingredient": r.json()["ingredient"], "created": False}
    assert r.json()["ingredient"]["name"] == "tomato"


def test_create_misspelling_needs_confirmation(client):
    r = client.post("/api/ingredients", json={"name": "brocolli"})
    assert r.status_code == 409
    assert r.json()[0]["ingredient"]["name"] == "broccoli"

    r = client.post("/api/ingredients", json={"name": "brocolli", "force": True})
    assert r.status_code == 201
    assert r.json()["created"] is True


def test_create_genuinely_new_ingredient(client):
    r = client.post("/api/ingredients", json={"name": "Yuzu Kosho", "category": "condiments & sauces"})
    assert r.status_code == 201
    assert r.json()["ingredient"]["name"] == "yuzu kosho"
    assert suggest(client, "yuzu")[0] == "yuzu kosho"


def test_remember_spelling_as_alias(client):
    broccoli = ingredient_id(client, "broccoli")
    r = client.post(f"/api/ingredients/{broccoli}/aliases", json={"alias": "brocolli"})
    assert r.status_code == 201
    assert ingredient_id(client, "brocolli") == broccoli
    # an alias can't steal a name that already means something else
    assert client.post(f"/api/ingredients/{broccoli}/aliases", json={"alias": "carrot"}).status_code == 409


def test_merge_repoints_recipes_and_keeps_old_name(client):
    dup = client.post("/api/ingredients", json={"name": "brocolli", "force": True}).json()["ingredient"]["id"]
    broccoli = ingredient_id(client, "broccoli")
    recipe = make_recipe(client, "Stir fry", ["brocolli", "garlic"])
    assert client.get("/api/ingredients/duplicates").json()[0]["a"]["id"] in (dup, broccoli)

    r = client.post(f"/api/ingredients/{dup}/merge", json={"into_id": broccoli})
    assert r.status_code == 200
    assert "brocolli" in [a["alias"] for a in r.json()["aliases"]]
    lines = client.get(f"/api/recipes/{recipe['id']}").json()["lines"]
    assert lines[0]["ingredient"]["name"] == "broccoli"
    assert ingredient_id(client, "brocolli") == broccoli
    assert client.get(f"/api/ingredients/{dup}").status_code == 404
    assert client.get("/api/ingredients/duplicates").json() == []


def test_seed_has_no_flagged_duplicates_and_dismiss_works(client):
    assert client.get("/api/ingredients/duplicates").json() == []
    client.post("/api/ingredients", json={"name": "cinamon", "force": True})
    pairs = client.get("/api/ingredients/duplicates").json()
    assert len(pairs) == 1
    r = client.post("/api/ingredients/duplicates/dismiss",
                    json={"a_id": pairs[0]["a"]["id"], "b_id": pairs[0]["b"]["id"]})
    assert r.status_code == 204
    assert client.get("/api/ingredients/duplicates").json() == []


def test_rename_keeps_old_name_as_alias(client):
    zuc = ingredient_id(client, "zucchini")
    # promoting an existing alias to the main name swaps them
    r = client.patch(f"/api/ingredients/{zuc}", json={"name": "Courgette", "is_staple": True})
    assert r.status_code == 200
    assert r.json()["name"] == "courgette" and r.json()["is_staple"]
    assert [a["alias"] for a in r.json()["aliases"]] == ["zucchini"]
    assert ingredient_id(client, "zucchini") == zuc
    # but a name belonging to another ingredient is refused
    assert client.patch(f"/api/ingredients/{zuc}", json={"name": "cucumber"}).status_code == 409


def test_delete_in_use_ingredient_is_refused(client):
    make_recipe(client, "Toast", ["bread", "butter"])
    assert client.delete(f"/api/ingredients/{ingredient_id(client, 'bread')}").status_code == 409


def test_parse_resolves_lines(client):
    text = "1 (14 oz) can diced tomatoes\n2 cups chopped brocolli\n3 large eggs\n\n1 lb boneless skinless chicken thighs"
    rows = client.post("/api/ingredients/parse", json={"text": text}).json()
    assert [r["ingredient"] and r["ingredient"]["name"] for r in rows] == [
        "canned tomato", None, "egg", "chicken thigh",
    ]
    assert rows[0]["note"] == "14 oz"
    assert rows[1]["suggestions"][0]["ingredient"]["name"] == "broccoli"
    assert rows[1]["note"] == "chopped"
