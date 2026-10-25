from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..auth import current_user
from ..db import get_db
from ..models import Ingredient, Recipe
from ..schemas import IngredientOut, SearchIn, SearchResult
from ..services.search import search_by_ingredients
from .recipes import summary

router = APIRouter(tags=["search"], dependencies=[Depends(current_user)])


@router.post("/search", response_model=list[SearchResult])
def search(body: SearchIn, db: Session = Depends(get_db)):
    hits = search_by_ingredients(db, body.have, body.must_use, body.ignore_staples, body.max_missing,
                                 body.tag_ids)
    if not hits:
        return []
    recipes = {r.id: r for r in db.scalars(
        select(Recipe).where(Recipe.id.in_([h.recipe_id for h in hits]))
        .options(selectinload(Recipe.tags), selectinload(Recipe.lines))
    )}
    missing_ids = {i for h in hits for i in h.missing_ids}
    ingredients = {i.id: i for i in db.scalars(select(Ingredient).where(Ingredient.id.in_(missing_ids)))}
    return [
        SearchResult(
            recipe=summary(recipes[h.recipe_id]), required=h.required, matched=h.matched,
            missing=[IngredientOut.model_validate(ingredients[i]) for i in h.missing_ids],
        )
        for h in hits
    ]
