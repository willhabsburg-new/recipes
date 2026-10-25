"""Parse free-text ingredient lines like '1 1/2 cups finely chopped broccoli florets, divided'."""

import re
from dataclasses import dataclass

from ..seed.units import unit_lookup

_UNITS = unit_lookup()

_UNICODE_FRACTIONS = {
    "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75, "⅕": 0.2, "⅖": 0.4, "⅗": 0.6,
    "⅘": 0.8, "⅙": 1 / 6, "⅚": 5 / 6, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
}

# Words that describe preparation or size rather than the ingredient itself.
_DESCRIPTORS = {
    "small", "medium", "large", "extra-large", "jumbo", "heaping", "level", "scant", "generous",
    "chopped", "diced", "minced", "sliced", "grated", "shredded", "crushed", "julienned", "cubed",
    "halved", "quartered", "peeled", "seeded", "pitted", "trimmed", "rinsed", "drained", "melted",
    "softened", "beaten", "sifted", "packed", "toasted", "roasted", "cooked", "uncooked", "thawed",
    "fresh", "freshly", "finely", "coarsely", "roughly", "thinly", "thickly", "lightly", "very",
    "room-temperature", "cold", "warm", "hot", "boneless", "skinless", "zested", "juiced", "torn",
}

_QTY = r"(?:\d+\s+\d+/\d+|\d+/\d+|\d*\.\d+|\d+(?:\s*[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])?|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])"
_QTY_RE = re.compile(rf"^\s*(?P<qty>{_QTY})(?:\s*(?:-|–|to)\s*(?P<qty2>{_QTY}))?\s*")


@dataclass
class ParsedLine:
    raw: str
    quantity: float | None
    unit: str | None
    name: str
    note: str
    # the same line read without moving descriptors to the note, for when the whole phrase
    # is itself a known ingredient ("diced tomatoes" -> canned tomato)
    full_name: str
    full_note: str
    optional: bool


def parse_quantity(s: str) -> float | None:
    s = s.strip()
    if not s:
        return None
    total = 0.0
    for ch, val in _UNICODE_FRACTIONS.items():
        if ch in s:
            total += val
            s = s.replace(ch, "").strip()
    if not s:
        return total
    parts = s.split()
    for part in parts:
        if "/" in part:
            num, den = part.split("/", 1)
            if not den or float(den) == 0:
                return None
            total += float(num) / float(den)
        else:
            total += float(part)
    return total


def parse_line(raw: str) -> ParsedLine:
    text = re.sub(r"^\s*[-*•]\s*", "", raw).strip()  # bullet points
    notes: list[str] = []
    optional = False

    # parentheticals: "(14 oz)", "(optional)"
    for paren in re.findall(r"\(([^)]*)\)", text):
        if paren.strip().lower() == "optional":
            optional = True
        elif paren.strip():
            notes.append(paren.strip())
    text = re.sub(r"\([^)]*\)", " ", text)

    quantity = None
    m = _QTY_RE.match(text)
    if m:
        quantity = parse_quantity(m.group("qty"))
        if m.group("qty2"):
            notes.insert(0, f"{m.group('qty')}–{m.group('qty2')}".replace(" ", ""))
        text = text[m.end():]

    unit = None
    words = text.split()
    if words:
        # two-word units first ("fl oz"), then one-word, tolerating a trailing period ("oz.")
        two = " ".join(words[:2]).rstrip(".")
        one = words[0].rstrip(".")
        if len(words) > 2 and two in _UNITS:
            unit, words = _UNITS[two], words[2:]
        elif len(words) > 1 and (one in _UNITS or one.lower() in _UNITS):
            unit = _UNITS.get(one) or _UNITS[one.lower()]
            words = words[1:]
        if words and words[0].lower() == "of":
            words = words[1:]
    text = " ".join(words)

    # everything after the first comma is preparation: "onion, finely chopped"
    if "," in text:
        text, after = text.split(",", 1)
        for part in after.split(","):
            part = part.strip()
            if part.lower() == "optional":
                optional = True
            elif part:
                notes.append(part)
    if re.search(r"\boptional\b", text, re.I):
        optional = True
        text = re.sub(r"\s*\boptional\b", "", text, flags=re.I)
    for phrase in ("to taste", "for garnish", "for serving", "as needed"):
        if phrase in text.lower():
            notes.append(phrase)
            text = re.sub(re.escape(phrase), "", text, flags=re.I)

    full_name = " ".join(text.split()).strip(" ,.-").lower()
    full_note = ", ".join(notes)
    kept, described = [], []
    for w in text.split():
        (described if w.lower().strip(",") in _DESCRIPTORS else kept).append(w)
    if not kept:  # don't strip a line down to nothing ("1 large")
        kept, described = described, []
    if described:
        notes.insert(0, " ".join(described).lower())

    return ParsedLine(
        raw=raw.strip(),
        quantity=quantity,
        unit=unit,
        name=" ".join(kept).strip(" ,.-").lower(),
        note=", ".join(notes),
        full_name=full_name,
        full_note=full_note,
        optional=optional,
    )
