"""The fixed unit list. Keys are what gets stored; values are spellings the line parser accepts."""

UNITS: dict[str, list[str]] = {
    "tsp": ["teaspoon", "teaspoons", "tsps", "t"],
    "tbsp": ["tablespoon", "tablespoons", "tbsps", "tbs", "tbl", "tbls", "T"],
    "cup": ["cups", "c"],
    "fl oz": ["fluid ounce", "fluid ounces", "fl. oz", "fl. oz."],
    "pint": ["pints", "pt"],
    "quart": ["quarts", "qt"],
    "gallon": ["gallons", "gal"],
    "ml": ["milliliter", "milliliters", "millilitre", "millilitres", "mL"],
    "l": ["liter", "liters", "litre", "litres", "L"],
    "oz": ["ounce", "ounces"],
    "lb": ["pound", "pounds", "lbs"],
    "g": ["gram", "grams", "gr"],
    "kg": ["kilogram", "kilograms", "kgs"],
    "pinch": ["pinches"],
    "dash": ["dashes"],
    "clove": ["cloves"],
    "can": ["cans", "tin", "tins"],
    "jar": ["jars"],
    "package": ["packages", "pkg", "pkgs", "packet", "packets", "box", "boxes", "bag", "bags"],
    "stick": ["sticks"],
    "slice": ["slices"],
    "piece": ["pieces", "pc", "pcs"],
    "bunch": ["bunches"],
    "sprig": ["sprigs"],
    "head": ["heads"],
    "stalk": ["stalks", "rib", "ribs"],
    "handful": ["handfuls"],
    "sheet": ["sheets"],
    "fillet": ["fillets", "filet", "filets"],
}

CATEGORIES = [
    "produce", "fruit", "herbs & spices", "meat", "poultry", "seafood", "dairy & eggs",
    "grains & pasta", "bread & bakery", "baking", "legumes", "nuts & seeds",
    "oils & vinegars", "condiments & sauces", "canned & jarred", "sweeteners",
    "beverages & alcohol", "frozen", "snacks", "other",
]


def unit_lookup() -> dict[str, str]:
    """Spelling -> stored unit. Case-sensitive keys ("T" is tbsp, "t" is tsp) plus lowercase fallbacks."""
    table: dict[str, str] = {}
    for unit, spellings in UNITS.items():
        table[unit] = unit
        for s in spellings:
            table[s] = unit
    for key, unit in list(table.items()):
        table.setdefault(key.lower(), unit)
    return table
