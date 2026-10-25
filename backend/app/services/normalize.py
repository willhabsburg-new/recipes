"""Turn whatever someone typed into the canonical form used for matching ingredients."""

import re
import unicodedata
from functools import lru_cache

import inflect

_inflect = inflect.engine()

# Words that look plural but aren't, which inflect would wrongly "singularize".
_KEEP_AS_IS = {
    "asparagus", "brussels", "citrus", "couscous", "grits", "greens", "hummus",
    "molasses", "octopus", "swiss",
}


def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def clean_display(s: str) -> str:
    """Tidy a name for display: trimmed, single-spaced, lowercase."""
    return re.sub(r"\s+", " ", s).strip().lower()


@lru_cache(maxsize=4096)
def singularize(word: str) -> str:
    if word in _KEEP_AS_IS or len(word) <= 3 or word.endswith(("ss", "us")):
        return word
    result = _inflect.singular_noun(word)
    return result if isinstance(result, str) and result else word


def normalize_name(s: str) -> str:
    """'  Cherry Tomatoes ' -> 'cherry tomato', 'Jalapeños' -> 'jalapeno'."""
    s = strip_accents(clean_display(s))
    s = re.sub(r"[^a-z0-9&' -]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    if not s:
        return ""
    words = s.split(" ")
    words[-1] = singularize(words[-1])
    return " ".join(words)
