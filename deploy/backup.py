"""Snapshot the SQLite database (safe while the app is running) and keep the last N copies.

    python deploy/backup.py [--keep 14] [--dest backend/data/backups]
"""

import argparse
import os
import sqlite3
from datetime import datetime
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1] / "backend"


def main() -> None:
    data_dir = Path(os.environ.get("RECIPE_DATA_DIR", BACKEND / "data"))
    parser = argparse.ArgumentParser()
    parser.add_argument("--keep", type=int, default=14)
    parser.add_argument("--dest", type=Path, default=data_dir / "backups")
    args = parser.parse_args()

    src = data_dir / "recipes.db"
    if not src.exists():
        raise SystemExit(f"No database at {src}")
    args.dest.mkdir(parents=True, exist_ok=True)
    target = args.dest / f"recipes-{datetime.now():%Y%m%d-%H%M%S}.db"

    with sqlite3.connect(src) as source, sqlite3.connect(target) as out:
        source.backup(out)
    print(f"Backed up to {target}")

    old = sorted(args.dest.glob("recipes-*.db"))[: -args.keep]
    for f in old:
        f.unlink()
    # photos aren't in the database; they live in data/photos and should be in your normal file backups


if __name__ == "__main__":
    main()
