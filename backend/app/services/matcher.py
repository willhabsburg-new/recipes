"""In-memory fuzzy index over ingredient names and aliases.

The whole ingredient list is a few thousand short strings at most, so it lives in memory
and is rebuilt lazily whenever an ingredient or alias changes (see invalidate()).
"""

import threading
from dataclasses import dataclass

from rapidfuzz import fuzz, process
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import DistinctPair, Ingredient, IngredientAlias
from .normalize import normalize_name


@dataclass(frozen=True)
class IngredientInfo:
    id: int
    canonical_name: str
    display_name: str
    category: str | None
    is_staple: bool


@dataclass(frozen=True)
class Match:
    ingredient: IngredientInfo
    matched: str  # the canonical name or alias that matched
    kind: str  # "exact" | "prefix" | "fuzzy"
    score: float


SUGGEST_FUZZY_CUTOFF = 72
DID_YOU_MEAN_CUTOFF = 78
DUPLICATE_CUTOFF = 85


class Matcher:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._stale = True
        self._ingredients: dict[int, IngredientInfo] = {}
        self._keys: list[str] = []  # canonical names and aliases
        self._key_owner: list[int] = []  # ingredient id per key
        self._exact: dict[str, int] = {}

    def invalidate(self) -> None:
        self._stale = True

    def _ensure(self, db: Session) -> None:
        if not self._stale:
            return
        with self._lock:
            if not self._stale:
                return
            ingredients = {
                i.id: IngredientInfo(i.id, i.canonical_name, i.display_name, i.category, i.is_staple)
                for i in db.scalars(select(Ingredient))
            }
            keys, owners = [], []
            for info in ingredients.values():
                keys.append(info.canonical_name)
                owners.append(info.id)
            for alias, ing_id in db.execute(select(IngredientAlias.alias, IngredientAlias.ingredient_id)):
                keys.append(alias)
                owners.append(ing_id)
            self._ingredients = ingredients
            self._keys, self._key_owner = keys, owners
            self._exact = dict(zip(keys, owners))
            self._stale = False

    def get(self, db: Session, ingredient_id: int) -> IngredientInfo | None:
        self._ensure(db)
        return self._ingredients.get(ingredient_id)

    def exact(self, db: Session, name: str) -> IngredientInfo | None:
        """The ingredient this name already means (by canonical name or alias), if any."""
        self._ensure(db)
        ing_id = self._exact.get(normalize_name(name))
        return self._ingredients.get(ing_id) if ing_id is not None else None

    def suggest(self, db: Session, query: str, limit: int = 8) -> list[Match]:
        """Autocomplete: exact, then prefix/word-prefix matches, then fuzzy (typo-tolerant) matches."""
        self._ensure(db)
        q = normalize_name(query)
        if not q:
            return []
        raw = query.strip().lower()
        best: dict[int, Match] = {}

        def offer(ing_id: int, key: str, kind: str, score: float) -> None:
            cur = best.get(ing_id)
            if cur is None or score > cur.score:
                best[ing_id] = Match(self._ingredients[ing_id], key, kind, score)

        for key, ing_id in zip(self._keys, self._key_owner):
            if key == q:
                offer(ing_id, key, "exact", 1000)
            elif key.startswith(q) or key.startswith(raw):
                # shorter completions first: "broc" -> "broccoli" before "broccoli rabe"
                offer(ing_id, key, "prefix", 500 - len(key))
            elif any(w.startswith(q) or w.startswith(raw) for w in key.split(" ")[1:]):
                offer(ing_id, key, "prefix", 400 - len(key))

        if len(q) >= 3:
            for key, score, idx in process.extract(
                q, self._keys, scorer=fuzz.WRatio, score_cutoff=SUGGEST_FUZZY_CUTOFF, limit=limit * 3
            ):
                offer(self._key_owner[idx], key, "fuzzy", score)

        ranked = sorted(best.values(), key=lambda m: (-m.score, m.ingredient.display_name))
        return ranked[:limit]

    def did_you_mean(self, db: Session, name: str, limit: int = 5) -> list[Match]:
        """Close spellings of a name that isn't known yet. Uses plain edit similarity so that
        'brocolli' -> 'broccoli' scores high but 'rice' doesn't match 'licorice'."""
        self._ensure(db)
        q = normalize_name(name)
        if not q:
            return []
        best: dict[int, Match] = {}
        for key, score, idx in process.extract(
            q, self._keys, scorer=fuzz.ratio, score_cutoff=DID_YOU_MEAN_CUTOFF, limit=limit * 3
        ):
            ing_id = self._key_owner[idx]
            if ing_id not in best or score > best[ing_id].score:
                best[ing_id] = Match(self._ingredients[ing_id], key, "fuzzy", score)
        return sorted(best.values(), key=lambda m: -m.score)[:limit]

    def duplicates(self, db: Session, cutoff: float = DUPLICATE_CUTOFF) -> list[tuple[IngredientInfo, IngredientInfo, float]]:
        """Pairs of distinct ingredients whose canonical names are suspiciously similar,
        minus pairs already confirmed as different."""
        self._ensure(db)
        dismissed = {(a, b) for a, b in db.execute(select(DistinctPair.a_id, DistinctPair.b_id))}
        infos = list(self._ingredients.values())
        names = [i.canonical_name for i in infos]
        pairs = []
        for i, name in enumerate(names):
            for _, score, j in process.extract(name, names, scorer=fuzz.ratio, score_cutoff=cutoff, limit=None):
                a, b = sorted((infos[i].id, infos[j].id))
                if j > i and (a, b) not in dismissed:
                    pairs.append((infos[i], infos[j], float(score)))
        return sorted(pairs, key=lambda p: -p[2])


matcher = Matcher()
