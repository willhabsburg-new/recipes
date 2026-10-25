import pytest

from app.services.normalize import normalize_name


@pytest.mark.parametrize("raw, expected", [
    ("Broccoli", "broccoli"),
    ("  Cherry   Tomatoes ", "cherry tomato"),
    ("broccolis", "broccoli"),
    ("Jalapeños", "jalapeno"),
    ("bay leaves", "bay leaf"),
    ("berries", "berry"),
    ("eggs", "egg"),
    ("asparagus", "asparagus"),
    ("hummus", "hummus"),
    ("molasses", "molasses"),
    ("brussels sprouts", "brussels sprout"),
    ("grits", "grits"),
    ("", ""),
    ("!!!", ""),
])
def test_normalize(raw, expected):
    assert normalize_name(raw) == expected
