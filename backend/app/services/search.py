"""Rank recipes by how much of their ingredient list you already have."""

from dataclasses import dataclass

from sqlalchemy import and_, case, func, literal, select
from sqlalchemy.orm import Session

from ..models import Ingredient, Recipe, RecipeIngredient, recipe_tags


@dataclass
class SearchHit:
    recipe_id: int
    required: int
    matched: int
    missing_ids: list[int]

    @property
    def missing(self) -> int:
        return self.required - self.matched

    @property
    def coverage(self) -> float:
        return self.matched / self.required if self.required else 1.0


def search_by_ingredients(
    db: Session,
    have: list[int],
    must_use: list[int] | None = None,
    ignore_staples: bool = True,
    max_missing: int = 2,
    tag_ids: list[int] | None = None,
) -> list[SearchHit]:
    must_use = list(dict.fromkeys(must_use or []))
    have_set = list(set(have) | set(must_use))
    if not have_set:
        return []

    ri = RecipeIngredient
    required = ri.optional.is_(False)
    if ignore_staples:
        required = and_(required, Ingredient.is_staple.is_(False))
    in_have = ri.ingredient_id.in_(have_set)

    # COUNT(DISTINCT ...) so an ingredient listed twice (e.g. butter for crust and filling) counts once
    required_n = func.count(func.distinct(case((required, ri.ingredient_id))))
    matched_n = func.count(func.distinct(case((and_(required, in_have), ri.ingredient_id))))
    any_hit_n = func.count(func.distinct(case((in_have, ri.ingredient_id))))

    stmt = (
        select(ri.recipe_id, required_n.label("required"), matched_n.label("matched"))
        .join(Ingredient, Ingredient.id == ri.ingredient_id)
        .group_by(ri.recipe_id)
        .having(any_hit_n >= 1)
        .having(required_n - matched_n <= max_missing)
    )
    if must_use:
        must_n = func.count(func.distinct(case((ri.ingredient_id.in_(must_use), ri.ingredient_id))))
        stmt = stmt.having(must_n == len(must_use))
    if tag_ids:
        tagged = (
            select(recipe_tags.c.recipe_id)
            .where(recipe_tags.c.tag_id.in_(tag_ids))
            .group_by(recipe_tags.c.recipe_id)
            .having(func.count() == literal(len(set(tag_ids))))
        )
        stmt = stmt.where(ri.recipe_id.in_(tagged))

    hits = {
        row.recipe_id: SearchHit(row.recipe_id, row.required, row.matched, [])
        for row in db.execute(stmt)
    }
    if not hits:
        return []

    missing_rows = db.execute(
        select(ri.recipe_id, ri.ingredient_id)
        .join(Ingredient, Ingredient.id == ri.ingredient_id)
        .where(ri.recipe_id.in_(hits.keys()), required, ~in_have)
        .order_by(ri.recipe_id, ri.position)
    )
    for recipe_id, ingredient_id in missing_rows:
        if ingredient_id not in hits[recipe_id].missing_ids:
            hits[recipe_id].missing_ids.append(ingredient_id)

    titles = dict(db.execute(select(Recipe.id, Recipe.title).where(Recipe.id.in_(hits.keys()))).all())
    return sorted(hits.values(), key=lambda h: (h.missing, -h.coverage, titles[h.recipe_id].lower()))
