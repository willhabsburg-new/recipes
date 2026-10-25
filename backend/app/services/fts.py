"""Full-text index over recipes (SQLite FTS5, table created in the initial migration),
maintained by the app rather than triggers so it can include ingredient and tag names."""

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from ..models import Recipe

def index_recipe(db: Session, recipe: Recipe) -> None:
    db.execute(text("DELETE FROM recipes_fts WHERE rowid = :id"), {"id": recipe.id})
    db.execute(
        text(
            "INSERT INTO recipes_fts(rowid, title, description, instructions, ingredients, tags) "
            "VALUES (:id, :title, :description, :instructions, :ingredients, :tags)"
        ),
        {
            "id": recipe.id,
            "title": recipe.title,
            "description": recipe.description or "",
            "instructions": recipe.instructions or "",
            "ingredients": " ".join(line.ingredient.display_name for line in recipe.lines),
            "tags": " ".join(t.name for t in recipe.tags),
        },
    )


def unindex_recipe(db: Session, recipe_id: int) -> None:
    db.execute(text("DELETE FROM recipes_fts WHERE rowid = :id"), {"id": recipe_id})


def reindex_all(db: Session) -> None:
    db.execute(text("DELETE FROM recipes_fts"))
    for recipe in db.scalars(select(Recipe)).all():
        index_recipe(db, recipe)
    db.commit()


def match_query(q: str) -> str | None:
    """User text -> safe FTS5 query: every word must appear, each as a prefix."""
    words = [w.replace('"', "") for w in q.split()]
    words = [w for w in words if w]
    if not words:
        return None
    return " ".join(f'"{w}"*' for w in words)
