import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session, selectinload

from ..auth import current_user
from ..config import Settings, app_settings
from ..db import get_db
from ..models import Ingredient, Recipe, RecipeIngredient, Tag, User, recipe_tags, utcnow
from ..schemas import RecipeIn, RecipeOut, RecipeSummary, TagOut
from ..seed.units import UNITS
from ..services import fts

router = APIRouter(tags=["recipes"], dependencies=[Depends(current_user)])

PHOTO_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}
MAX_PHOTO_BYTES = 15 * 1024 * 1024
_PHOTO_NAME = re.compile(r"^[0-9a-f-]+\.(jpg|png|webp|gif)$")


def _total(r: Recipe) -> int | None:
    if r.prep_minutes is None and r.cook_minutes is None:
        return None
    return (r.prep_minutes or 0) + (r.cook_minutes or 0)


def summary(r: Recipe) -> RecipeSummary:
    return RecipeSummary(
        id=r.id, title=r.title, description=r.description, servings=r.servings, total_minutes=_total(r),
        photo_url=f"/api/photos/{r.photo_path}" if r.photo_path else None,
        tags=[t.name for t in r.tags], ingredient_count=len({ln.ingredient_id for ln in r.lines}),
        updated_at=r.updated_at,
    )


def detail(r: Recipe) -> RecipeOut:
    return RecipeOut(
        **summary(r).model_dump(), instructions=r.instructions, prep_minutes=r.prep_minutes,
        cook_minutes=r.cook_minutes, source_url=r.source_url,
        created_by=r.author.name if r.author else None, lines=r.lines,
    )


def _load(db: Session, recipe_id: int) -> Recipe:
    recipe = db.scalar(
        select(Recipe).where(Recipe.id == recipe_id).options(
            selectinload(Recipe.lines).selectinload(RecipeIngredient.ingredient),
            selectinload(Recipe.tags), selectinload(Recipe.author),
        )
    )
    if not recipe:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such recipe")
    return recipe


def _apply(db: Session, recipe: Recipe, body: RecipeIn) -> None:
    ids = {ln.ingredient_id for ln in body.lines}
    found = set(db.scalars(select(Ingredient.id).where(Ingredient.id.in_(ids))))
    if ids - found:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown ingredient ids: {sorted(ids - found)}")
    for ln in body.lines:
        if ln.unit and ln.unit not in UNITS:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown unit: {ln.unit}")

    for field in ("title", "description", "instructions", "servings", "prep_minutes", "cook_minutes"):
        setattr(recipe, field, getattr(body, field))
    recipe.title = recipe.title.strip()
    recipe.source_url = (body.source_url or "").strip() or None
    recipe.updated_at = utcnow()  # line/tag-only edits don't touch the row, so onupdate won't fire

    tags = []
    for name in body.tags:
        tag = db.scalar(select(Tag).where(Tag.name == name))
        if not tag:
            tag = Tag(name=name)
            db.add(tag)
        tags.append(tag)
    recipe.tags = tags

    recipe.lines = [
        RecipeIngredient(ingredient_id=ln.ingredient_id, quantity=ln.quantity, unit=ln.unit or None,
                         note=ln.note.strip(), optional=ln.optional, position=i)
        for i, ln in enumerate(body.lines)
    ]


def _prune_tags(db: Session) -> None:
    db.execute(text("DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM recipe_tags)"))


@router.get("/recipes", response_model=list[RecipeSummary])
def list_recipes(
    q: str | None = Query(None, max_length=200),
    tag: list[str] = Query([]),
    ingredient: list[int] = Query([]),
    sort: str = Query("title", pattern="^(title|recent)$"),
    db: Session = Depends(get_db),
):
    stmt = select(Recipe).options(selectinload(Recipe.tags), selectinload(Recipe.lines))
    if q and (match := fts.match_query(q)):
        ids = select(text("rowid")).select_from(text("recipes_fts")).where(text("recipes_fts MATCH :m"))
        stmt = stmt.where(Recipe.id.in_(ids)).params(m=match)
    for name in tag:
        stmt = stmt.where(Recipe.tags.any(Tag.name == name.lower()))
    for ing_id in ingredient:
        stmt = stmt.where(Recipe.lines.any(RecipeIngredient.ingredient_id == ing_id))
    stmt = stmt.order_by(Recipe.updated_at.desc() if sort == "recent" else func.lower(Recipe.title))
    return [summary(r) for r in db.scalars(stmt)]


@router.get("/tags", response_model=list[TagOut])
def list_tags(db: Session = Depends(get_db)):
    rows = db.execute(
        select(Tag.id, Tag.name, func.count(recipe_tags.c.recipe_id))
        .join(recipe_tags, recipe_tags.c.tag_id == Tag.id).group_by(Tag.id).order_by(Tag.name)
    )
    return [TagOut(id=i, name=n, count=c) for i, n, c in rows]


@router.get("/recipes/{recipe_id}", response_model=RecipeOut)
def get_recipe(recipe_id: int, db: Session = Depends(get_db)):
    return detail(_load(db, recipe_id))


@router.post("/recipes", response_model=RecipeOut, status_code=201)
def create_recipe(body: RecipeIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    recipe = Recipe(created_by=user.id)
    _apply(db, recipe, body)
    db.add(recipe)
    db.flush()
    recipe = _load(db, recipe.id)
    fts.index_recipe(db, recipe)
    db.commit()
    return detail(recipe)


@router.put("/recipes/{recipe_id}", response_model=RecipeOut)
def update_recipe(recipe_id: int, body: RecipeIn, db: Session = Depends(get_db)):
    recipe = _load(db, recipe_id)
    _apply(db, recipe, body)
    db.flush()
    _prune_tags(db)
    db.expire_all()
    recipe = _load(db, recipe_id)
    fts.index_recipe(db, recipe)
    db.commit()
    return detail(recipe)


@router.delete("/recipes/{recipe_id}", status_code=204)
def delete_recipe(recipe_id: int, db: Session = Depends(get_db), settings: Settings = Depends(app_settings)):
    recipe = _load(db, recipe_id)
    photo = recipe.photo_path
    db.delete(recipe)
    fts.unindex_recipe(db, recipe_id)
    db.flush()
    _prune_tags(db)
    db.commit()
    if photo:
        (settings.photos_dir / photo).unlink(missing_ok=True)


@router.post("/recipes/{recipe_id}/photo", response_model=RecipeOut)
async def upload_photo(recipe_id: int, file: UploadFile, db: Session = Depends(get_db),
                       settings: Settings = Depends(app_settings)):
    recipe = _load(db, recipe_id)
    ext = PHOTO_TYPES.get(file.content_type or "")
    if not ext:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Photos must be JPEG, PNG, WebP or GIF")
    data = await file.read(MAX_PHOTO_BYTES + 1)
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Photo is larger than 15 MB")
    settings.photos_dir.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4()}{ext}"
    (settings.photos_dir / name).write_bytes(data)
    old = recipe.photo_path
    recipe.photo_path = name
    db.commit()
    if old:
        (settings.photos_dir / old).unlink(missing_ok=True)
    return detail(recipe)


@router.delete("/recipes/{recipe_id}/photo", response_model=RecipeOut)
def delete_photo(recipe_id: int, db: Session = Depends(get_db), settings: Settings = Depends(app_settings)):
    recipe = _load(db, recipe_id)
    if recipe.photo_path:
        (settings.photos_dir / recipe.photo_path).unlink(missing_ok=True)
        recipe.photo_path = None
        db.commit()
    return detail(recipe)


@router.get("/photos/{name}")
def get_photo(name: str, settings: Settings = Depends(app_settings)):
    path = settings.photos_dir / name
    if not _PHOTO_NAME.match(name) or not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such photo")
    return FileResponse(path, headers={"Cache-Control": "private, max-age=31536000, immutable"})
