from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, selectinload

from ..auth import current_user, require_admin
from ..db import get_db
from ..models import DistinctPair, Ingredient, IngredientAlias, Recipe, RecipeIngredient, User
from ..schemas import (
    AliasCreate, CheckOut, DismissIn, DuplicatePair, IngredientCreate, IngredientCreateOut, IngredientDetail,
    IngredientOut, IngredientUpdate, MergeIn, ParsedLineOut, ParseIn, SuggestionOut, UnitsOut,
)
from ..seed.units import CATEGORIES, UNITS
from ..services import fts
from ..services.line_parser import parse_line
from ..services.matcher import IngredientInfo, Match, matcher
from ..services.normalize import clean_display, normalize_name

router = APIRouter(tags=["ingredients"], dependencies=[Depends(current_user)])


def _out(info: IngredientInfo | Ingredient) -> IngredientOut:
    return IngredientOut(id=info.id, display_name=info.display_name, canonical_name=info.canonical_name,
                         category=info.category, is_staple=info.is_staple)


def _suggestion(m: Match) -> SuggestionOut:
    return SuggestionOut(ingredient=_out(m.ingredient), matched=m.matched, kind=m.kind, score=round(m.score, 1))


def _name_taken(db: Session, canonical: str, except_id: int | None = None) -> Ingredient | None:
    existing = matcher.exact(db, canonical)
    if existing and existing.id != except_id:
        return db.get(Ingredient, existing.id)
    return None


def _detail(db: Session, ing: Ingredient) -> IngredientDetail:
    count = db.scalar(
        select(func.count(func.distinct(RecipeIngredient.recipe_id))).where(RecipeIngredient.ingredient_id == ing.id)
    )
    return _detail_row(ing, count or 0)


def _detail_row(ing: Ingredient, recipe_count: int) -> IngredientDetail:
    return IngredientDetail(id=ing.id, display_name=ing.display_name, canonical_name=ing.canonical_name,
                            category=ing.category, is_staple=ing.is_staple, aliases=ing.aliases,
                            recipe_count=recipe_count)


def _reindex_recipes_using(db: Session, ingredient_id: int) -> None:
    for recipe in db.scalars(
        select(Recipe).join(RecipeIngredient).where(RecipeIngredient.ingredient_id == ingredient_id).distinct()
    ):
        fts.index_recipe(db, recipe)


@router.get("/units", response_model=UnitsOut)
def units():
    return UnitsOut(units=list(UNITS), categories=CATEGORIES)


@router.get("/ingredients/suggest", response_model=list[SuggestionOut])
def suggest(q: str = Query(min_length=1, max_length=120), limit: int = Query(8, ge=1, le=25),
            db: Session = Depends(get_db)):
    return [_suggestion(m) for m in matcher.suggest(db, q, limit)]


@router.get("/ingredients/check", response_model=CheckOut)
def check(name: str = Query(min_length=1, max_length=120), db: Session = Depends(get_db)):
    """Is this name already known? If not, what might the user have meant?"""
    exact = matcher.exact(db, name)
    return CheckOut(
        normalized=normalize_name(name),
        exact=_out(exact) if exact else None,
        suggestions=[] if exact else [_suggestion(m) for m in matcher.did_you_mean(db, name)],
    )


@router.post("/ingredients/parse", response_model=list[ParsedLineOut])
def parse(body: ParseIn, db: Session = Depends(get_db)):
    """Parse pasted ingredient lines and resolve each to a known ingredient where possible."""
    out = []
    for raw in body.text.splitlines():
        if not raw.strip():
            continue
        p = parse_line(raw)
        exact = matcher.exact(db, p.full_name) if p.full_name else None
        if exact:
            p.name, p.note = p.full_name, p.full_note
        elif p.name:
            exact = matcher.exact(db, p.name)
        out.append(ParsedLineOut(
            raw=p.raw, quantity=p.quantity, unit=p.unit, name=p.name, note=p.note, optional=p.optional,
            ingredient=_out(exact) if exact else None,
            suggestions=[] if exact or not p.name else [_suggestion(m) for m in matcher.did_you_mean(db, p.name)],
        ))
    return out


@router.get("/ingredients", response_model=list[IngredientDetail])
def list_ingredients(q: str | None = None, used_only: bool = False, db: Session = Depends(get_db)):
    counts = dict(db.execute(
        select(RecipeIngredient.ingredient_id, func.count(func.distinct(RecipeIngredient.recipe_id)))
        .group_by(RecipeIngredient.ingredient_id)
    ).all())
    stmt = select(Ingredient).options(selectinload(Ingredient.aliases)).order_by(Ingredient.display_name)
    if q:
        stmt = stmt.where(Ingredient.canonical_name.contains(normalize_name(q)))
    result = []
    for ing in db.scalars(stmt):
        n = counts.get(ing.id, 0)
        if used_only and not n:
            continue
        result.append(_detail_row(ing, n))
    return result


@router.get("/ingredients/duplicates", response_model=list[DuplicatePair])
def duplicates(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return [DuplicatePair(a=_out(a), b=_out(b), score=round(s, 1)) for a, b, s in matcher.duplicates(db)]


@router.post("/ingredients/duplicates/dismiss", status_code=204)
def dismiss_duplicate(body: DismissIn, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Mark two similarly named ingredients as genuinely different."""
    a, b = sorted((body.a_id, body.b_id))
    if a == b or not db.get(Ingredient, a) or not db.get(Ingredient, b):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such ingredient pair")
    if not db.get(DistinctPair, (a, b)):
        db.add(DistinctPair(a_id=a, b_id=b))
        db.commit()


@router.get("/ingredients/{ingredient_id}", response_model=IngredientDetail)
def get_ingredient(ingredient_id: int, db: Session = Depends(get_db)):
    ing = db.get(Ingredient, ingredient_id)
    if not ing:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such ingredient")
    return _detail(db, ing)


@router.post("/ingredients", response_model=IngredientCreateOut,
             responses={201: {"model": IngredientCreateOut}, 409: {"model": list[SuggestionOut]}})
def create_ingredient(body: IngredientCreate, db: Session = Depends(get_db)):
    """Returns the existing ingredient if the name is already known (200). If the name looks
    like a misspelling of something known, returns 409 with suggestions unless force=true."""
    canonical = normalize_name(body.name)
    if not canonical:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Ingredient name is empty")
    existing = matcher.exact(db, canonical)
    if existing:
        return IngredientCreateOut(ingredient=_out(existing), created=False)
    if not body.force:
        close = matcher.did_you_mean(db, canonical)
        if close:
            return JSONResponse(status_code=409, content=[_suggestion(m).model_dump() for m in close])
    if body.category is not None and body.category not in CATEGORIES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown category")
    ing = Ingredient(canonical_name=canonical, display_name=clean_display(body.name),
                     category=body.category, is_staple=body.is_staple)
    db.add(ing)
    db.commit()
    matcher.invalidate()
    return JSONResponse(status_code=201,
                        content=IngredientCreateOut(ingredient=_out(ing), created=True).model_dump())


@router.patch("/ingredients/{ingredient_id}", response_model=IngredientDetail)
def update_ingredient(ingredient_id: int, body: IngredientUpdate, _: User = Depends(require_admin),
                      db: Session = Depends(get_db)):
    ing = db.get(Ingredient, ingredient_id)
    if not ing:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such ingredient")
    if body.name is not None:
        canonical = normalize_name(body.name)
        if not canonical:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Ingredient name is empty")
        clash = _name_taken(db, canonical, except_id=ing.id)
        if clash:
            raise HTTPException(status.HTTP_409_CONFLICT,
                                f"“{clash.display_name}” already uses that name; merge them instead")
        if canonical != ing.canonical_name:
            # keep the old spelling working, unless it's one of this ingredient's aliases already
            old = ing.canonical_name
            ing.aliases = [a for a in ing.aliases if a.alias != canonical]
            ing.canonical_name = canonical
            db.flush()
            ing.aliases.append(IngredientAlias(alias=old))
        ing.display_name = clean_display(body.name)
    if "category" in body.model_fields_set:
        if body.category is not None and body.category not in CATEGORIES:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown category")
        ing.category = body.category
    if body.is_staple is not None:
        ing.is_staple = body.is_staple
    db.flush()
    _reindex_recipes_using(db, ing.id)
    db.commit()
    matcher.invalidate()
    return _detail(db, ing)


@router.post("/ingredients/{ingredient_id}/aliases", response_model=IngredientDetail, status_code=201)
def add_alias(ingredient_id: int, body: AliasCreate, db: Session = Depends(get_db)):
    """Remember another spelling for an ingredient, e.g. 'brocolli' -> broccoli."""
    ing = db.get(Ingredient, ingredient_id)
    if not ing:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such ingredient")
    alias = normalize_name(body.alias)
    if not alias:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Alias is empty")
    clash = _name_taken(db, alias)
    if clash and clash.id != ing.id:
        raise HTTPException(status.HTTP_409_CONFLICT, f"“{body.alias}” already means {clash.display_name}")
    if not clash:
        ing.aliases.append(IngredientAlias(alias=alias))
        db.commit()
        matcher.invalidate()
    return _detail(db, ing)


@router.delete("/ingredients/aliases/{alias_id}", status_code=204)
def delete_alias(alias_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    alias = db.get(IngredientAlias, alias_id)
    if not alias:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such alias")
    db.delete(alias)
    db.commit()
    matcher.invalidate()


@router.post("/ingredients/{ingredient_id}/merge", response_model=IngredientDetail)
def merge_ingredient(ingredient_id: int, body: MergeIn, _: User = Depends(require_admin),
                     db: Session = Depends(get_db)):
    """Fold ingredient_id into into_id: recipes are re-pointed and the old names become aliases."""
    if ingredient_id == body.into_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Can't merge an ingredient into itself")
    src, dst = db.get(Ingredient, ingredient_id), db.get(Ingredient, body.into_id)
    if not src or not dst:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such ingredient")

    db.execute(update(RecipeIngredient).where(RecipeIngredient.ingredient_id == src.id)
               .values(ingredient_id=dst.id))
    db.execute(update(IngredientAlias).where(IngredientAlias.ingredient_id == src.id)
               .values(ingredient_id=dst.id))
    old_name = src.canonical_name
    db.delete(src)
    db.flush()
    db.add(IngredientAlias(alias=old_name, ingredient_id=dst.id))
    db.flush()
    db.refresh(dst)
    _reindex_recipes_using(db, dst.id)
    db.commit()
    matcher.invalidate()
    return _detail(db, dst)


@router.delete("/ingredients/{ingredient_id}", status_code=204)
def delete_ingredient(ingredient_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    ing = db.get(Ingredient, ingredient_id)
    if not ing:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such ingredient")
    if db.scalar(select(func.count()).where(RecipeIngredient.ingredient_id == ing.id)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Recipes still use this ingredient; merge it instead")
    db.delete(ing)
    db.commit()
    matcher.invalidate()
