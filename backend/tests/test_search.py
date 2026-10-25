import pytest
from conftest import ingredient_id, make_recipe


@pytest.fixture
def recipes(client):
    return {
        "stir fry": make_recipe(client, "Broccoli Stir Fry", ["broccoli", "garlic", "soy sauce", "salt"],
                                optional=["sesame seed"], tags=["dinner"]),
        "pasta": make_recipe(client, "Garlic Pasta", ["spaghetti", "garlic", "parmesan", "olive oil"],
                             tags=["dinner"]),
        "omelette": make_recipe(client, "Omelette", ["egg", "butter", "cheddar", "chive"],
                                tags=["breakfast"]),
    }


def search(client, have, **kw):
    body = {"have": [ingredient_id(client, n) for n in have], **kw}
    if "must_use" in kw:
        body["must_use"] = [ingredient_id(client, n) for n in kw["must_use"]]
    r = client.post("/api/search", json=body)
    assert r.status_code == 200, r.text
    return [(x["recipe"]["title"], x["matched"], x["required"], [m["name"] for m in x["missing"]])
            for x in r.json()]


def test_ready_to_cook_ignores_staples_and_optional(client, recipes):
    # salt is a staple, sesame seed is optional
    assert search(client, ["broccoli", "garlic", "soy sauce"])[0] == ("Broccoli Stir Fry", 3, 3, [])


def test_results_ranked_by_missing(client, recipes):
    results = search(client, ["broccoli", "garlic", "spaghetti"])
    assert results == [
        ("Broccoli Stir Fry", 2, 3, ["soy sauce"]),
        ("Garlic Pasta", 2, 3, ["parmesan"]),
    ]


def test_max_missing_filters(client, recipes):
    assert search(client, ["garlic"], max_missing=1) == []
    assert [r[0] for r in search(client, ["garlic"], max_missing=2)] == ["Broccoli Stir Fry", "Garlic Pasta"]


def test_no_overlap_means_no_result(client, recipes):
    assert search(client, ["egg"], max_missing=10) == [("Omelette", 1, 4, ["butter", "cheddar", "chive"])]


def test_must_use(client, recipes):
    results = search(client, ["garlic", "broccoli", "spaghetti", "parmesan"], must_use=["parmesan"])
    assert [r[0] for r in results] == ["Garlic Pasta"]


def test_tag_filter(client, recipes):
    tags = {t["name"]: t["id"] for t in client.get("/api/tags").json()}
    results = search(client, ["garlic", "egg", "butter", "cheddar"], max_missing=3, tag_ids=[tags["breakfast"]])
    assert [r[0] for r in results] == ["Omelette"]


def test_staples_can_count(client, recipes):
    assert search(client, ["broccoli", "garlic", "soy sauce"], ignore_staples=False)[0] == (
        "Broccoli Stir Fry", 3, 4, ["salt"])


def test_empty_search(client, recipes):
    assert search(client, []) == []
