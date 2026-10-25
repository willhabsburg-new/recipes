from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- auth / users ---

class UserOut(ORM):
    id: int
    name: str
    email: str
    is_admin: bool


class LoginIn(BaseModel):
    email: str = Field(min_length=1, max_length=255)
    password: str


class SetupIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8)


class UserCreate(SetupIn):
    is_admin: bool = False


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    is_admin: bool | None = None
    password: str | None = Field(default=None, min_length=8)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class AuthStatus(BaseModel):
    needs_setup: bool
    user: UserOut | None


# --- ingredients ---

class IngredientOut(ORM):
    id: int
    name: str = Field(validation_alias="display_name")
    canonical_name: str
    category: str | None
    is_staple: bool


class AliasOut(ORM):
    id: int
    alias: str


class IngredientDetail(IngredientOut):
    aliases: list[AliasOut]
    recipe_count: int = 0


class SuggestionOut(BaseModel):
    ingredient: IngredientOut
    matched: str
    kind: str
    score: float


class CheckOut(BaseModel):
    normalized: str
    exact: IngredientOut | None
    suggestions: list[SuggestionOut]


class IngredientCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: str | None = None
    is_staple: bool = False
    # skip the "did you mean" check; the user has confirmed this really is new
    force: bool = False


class IngredientCreateOut(BaseModel):
    ingredient: IngredientOut
    created: bool


class IngredientUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    category: str | None = None
    is_staple: bool | None = None


class AliasCreate(BaseModel):
    alias: str = Field(min_length=1, max_length=120)


class MergeIn(BaseModel):
    into_id: int


class DismissIn(BaseModel):
    a_id: int
    b_id: int


class DuplicatePair(BaseModel):
    a: IngredientOut
    b: IngredientOut
    score: float


class ParseIn(BaseModel):
    text: str = Field(max_length=20000)


class ParsedLineOut(BaseModel):
    raw: str
    quantity: float | None
    unit: str | None
    name: str
    note: str
    optional: bool
    ingredient: IngredientOut | None
    suggestions: list[SuggestionOut]


# --- recipes ---

class RecipeLineIn(BaseModel):
    ingredient_id: int
    quantity: float | None = Field(default=None, ge=0)
    unit: str | None = None
    note: str = Field(default="", max_length=200)
    optional: bool = False


class RecipeLineOut(ORM):
    id: int
    ingredient: IngredientOut
    quantity: float | None
    unit: str | None
    note: str
    optional: bool


class RecipeIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    instructions: str = ""
    servings: int | None = Field(default=None, ge=1)
    prep_minutes: int | None = Field(default=None, ge=0)
    cook_minutes: int | None = Field(default=None, ge=0)
    source_url: str | None = Field(default=None, max_length=500)
    tags: list[str] = []
    lines: list[RecipeLineIn] = []

    @field_validator("tags")
    @classmethod
    def clean_tags(cls, tags: list[str]) -> list[str]:
        cleaned = [t.strip().lower()[:50] for t in tags if t.strip()]
        return list(dict.fromkeys(cleaned))


class RecipeSummary(BaseModel):
    id: int
    title: str
    description: str
    servings: int | None
    total_minutes: int | None
    photo_url: str | None
    tags: list[str]
    ingredient_count: int
    updated_at: datetime


class RecipeOut(RecipeSummary):
    instructions: str
    prep_minutes: int | None
    cook_minutes: int | None
    source_url: str | None
    created_by: str | None
    lines: list[RecipeLineOut]


class TagOut(BaseModel):
    id: int
    name: str
    count: int


# --- search ---

class SearchIn(BaseModel):
    have: list[int] = []
    must_use: list[int] = []
    ignore_staples: bool = True
    max_missing: int = Field(default=2, ge=0, le=10)
    tag_ids: list[int] = []


class SearchResult(BaseModel):
    recipe: RecipeSummary
    required: int
    matched: int
    missing: list[IngredientOut]


class UnitsOut(BaseModel):
    units: list[str]
    categories: list[str]
