# Will's Recipes

A self-hosted recipe app for the family. You enter recipes, then search by the ingredients you
have: it lists what you can cook now and what's only one or two ingredients away. It's dark by
default and installs on phones as an app (PWA).

## Ingredients stay consistent

Every recipe ingredient is picked from one shared ingredient list, which starts with about 900
common ingredients:

- **Autocomplete with typo tolerance.** Typing `brocolli` still suggests **broccoli**. Plurals
  and alternate names also resolve: `tomatoes` → tomato, `scallions` → green onion.
- **Did you mean?** If you type a name that isn't in the list, it's underlined and you get the
  closest matches. You can pick one and optionally remember your spelling, so it resolves
  automatically next time. Or you can confirm that it really is a new ingredient.
- **Possible duplicates.** Admins have a page (Ingredients → Possible duplicates) that flags
  similar names and merges them. Merging moves every recipe over and keeps the old name working
  as an alias.
- **Spell check.** Titles, descriptions and instructions use the browser's or phone's own spell
  checker.

You can paste a whole ingredient list ("2 cups chopped broccoli…") into the editor. Each line is
split into quantity, unit, ingredient and note, then matched the same way.

## Development

Requires Python 3.12+ and Node 20.19+.

```sh
make install      # venv + pip, npm install
make dev          # API on :8000 (auto-reload) + Vite on :5173 -> open http://localhost:5173
make test         # pytest + vitest
```

The first time you open the app it asks you to create an admin account. Add family members
under Settings.

npm 10.8 has a peer-dependency resolver bug that crashes `npm install` for this project, so
`frontend/.npmrc` sets `legacy-peer-deps=true`.

## Running it for real

```sh
make build        # builds the frontend into frontend/dist
make run          # one process on 127.0.0.1:8000 serving the API and the app
```

Data lives in `backend/data/`: `recipes.db` (SQLite) and `photos/`. You can override the
location with `RECIPE_DATA_DIR`. Database migrations run automatically at startup.

### HTTPS with Tailscale (needed for "Add to Home Screen")

Phones only install a PWA served over HTTPS. The easiest way to get that is Tailscale:

```sh
sudo tailscale serve --bg 8000
```

The app is then at `https://<this-machine>.<your-tailnet>.ts.net` with a real certificate.
Family members need Tailscale on their phones, and either the same tailnet or this machine
shared with them. On the phone, open that URL, then use **Share → Add to Home Screen** (iOS) or
**Install app** (Android/Chrome).

### Run on boot, and nightly backups

```sh
sudo cp deploy/recipe-box.service deploy/recipe-box-backup.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now recipe-box recipe-box-backup.timer
```

Edit `User=` and the paths in the unit files first if they differ from yours. Backups go to
`backend/data/backups/` (the last 14 are kept). You can also run one by hand with `make backup`.
Photos aren't in the database, so include `backend/data/photos/` in whatever backs up the
machine.

## Layout

```
backend/app/
  main.py               app factory: migrations, seeding, serves frontend/dist
  models.py schemas.py  SQLAlchemy models, API schemas
  routers/              auth+users, ingredients, recipes, search
  services/
    normalize.py        "Jalapeños " -> "jalapeno" (lowercase, accents, singular)
    matcher.py          in-memory fuzzy index: suggest, did-you-mean, duplicates
    line_parser.py      "1 1/2 cups chopped broccoli" -> qty/unit/name/note
    search.py           ranks recipes by how much of their ingredient list you have
    fts.py              SQLite FTS5 index for text search
  seed/ingredients.csv  starter ingredient list: name, category, staple, aliases
backend/alembic/        migrations
frontend/src/
  components/IngredientInput.tsx   the autocomplete + did-you-mean box
  pages/                           Search (home), recipes, editor, ingredients, settings
deploy/                 systemd units, backup script
```
