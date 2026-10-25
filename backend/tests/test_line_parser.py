import pytest

from app.services.line_parser import parse_line


@pytest.mark.parametrize("line, qty, unit, name, note, optional", [
    ("2 cups chopped broccoli", 2, "cup", "broccoli", "chopped", False),
    ("1 1/2 tsp kosher salt", 1.5, "tsp", "kosher salt", "", False),
    ("½ cup sugar", 0.5, "cup", "sugar", "", False),
    ("1½ cups flour", 1.5, "cup", "flour", "", False),
    ("3 large eggs, beaten", 3, None, "eggs", "large, beaten", False),
    ("1 onion, finely chopped", 1, None, "onion", "finely chopped", False),
    ("2-3 cloves garlic, minced", 2, "clove", "garlic", "2–3, minced", False),
    ("1 T olive oil", 1, "tbsp", "olive oil", "", False),
    ("1 t vanilla", 1, "tsp", "vanilla", "", False),
    ("1 lb. ground beef", 1, "lb", "ground beef", "", False),
    ("2 tbsp fresh parsley (optional)", 2, "tbsp", "parsley", "fresh", True),
    ("8 fl oz heavy cream", 8, "fl oz", "heavy cream", "", False),
    ("pinch of nutmeg", None, "pinch", "nutmeg", "", False),
    ("salt to taste", None, None, "salt", "to taste", False),
    ("- 1 cup milk", 1, "cup", "milk", "", False),
])
def test_parse_line(line, qty, unit, name, note, optional):
    p = parse_line(line)
    assert p.quantity == pytest.approx(qty) if qty is not None else p.quantity is None
    assert (p.unit, p.name, p.note, p.optional) == (unit, name, note, optional)


def test_full_phrase_kept_for_resolution():
    p = parse_line("1 (14 oz) can diced tomatoes")
    assert (p.quantity, p.unit, p.name) == (1, "can", "tomatoes")
    assert p.full_name == "diced tomatoes"
    assert p.full_note == "14 oz"
