VENV := backend/.venv
PY := $(VENV)/bin/python
HOST ?= 127.0.0.1
PORT ?= 8000

.PHONY: install dev dev-api dev-web build test test-api test-web run backup icons

install: $(VENV)
	$(VENV)/bin/pip install -q -e "backend[dev]"
	cd frontend && npm install

$(VENV):
	python3 -m venv $(VENV)

# API on :8000 with reload, Vite on :5173 proxying /api to it. Open http://localhost:5173
dev:
	$(MAKE) -j2 dev-api dev-web

dev-api:
	cd backend && .venv/bin/uvicorn app.main:app --reload --host $(HOST) --port $(PORT)

dev-web:
	cd frontend && npm run dev

build:
	cd frontend && npm run build

test: test-api test-web

test-api:
	cd backend && .venv/bin/python -m pytest -q

test-web:
	cd frontend && npx vitest run

# Production-style: one process serving the API and the built app. Run `make build` first.
run:
	cd backend && .venv/bin/uvicorn app.main:app --host $(HOST) --port $(PORT) --proxy-headers

backup:
	$(PY) deploy/backup.py

icons:
	cd frontend && python3 scripts/make_icons.py
