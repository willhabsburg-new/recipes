import csv
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import DistinctPair, Ingredient, IngredientAlias
from ..services.matcher import matcher
from ..services.normalize import clean_display, normalize_name

SEED_CSV = Path(__file__).with_name("ingredients.csv")


def seed_ingredients(db: Session, path: Path = SEED_CSV) -> int:
    """Load the starter ingredient dictionary. Only runs on an empty ingredients table."""
    if db.scalar(select(func.count(Ingredient.id))):
        return 0

    taken: set[str] = set()
    rows: list[tuple[Ingredient, list[str]]] = []
    with path.open(newline="") as f:
        for row in csv.DictReader(f):
            canonical = normalize_name(row["name"])
            if not canonical or canonical in taken:
                continue
            taken.add(canonical)
            ing = Ingredient(
                canonical_name=canonical,
                display_name=clean_display(row["name"]),
                category=row["category"] or None,
                is_staple=row["staple"] == "1",
            )
            aliases = [a for a in (row.get("aliases") or "").split(";") if a.strip()]
            rows.append((ing, aliases))

    for ing, aliases in rows:
        for a in aliases:
            alias = normalize_name(a)
            if alias and alias not in taken:
                taken.add(alias)
                ing.aliases.append(IngredientAlias(alias=alias))
        db.add(ing)
    db.commit()

    # the starter list has a few deliberately similar names (salted/unsalted butter); don't
    # flag those as possible duplicates
    matcher.invalidate()
    for a, b, _ in matcher.duplicates(db):
        db.add(DistinctPair(a_id=min(a.id, b.id), b_id=max(a.id, b.id)))
    db.commit()
    return len(rows)
