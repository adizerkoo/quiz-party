## Backend Modular Monolith

Backend remains a single FastAPI application, a single PostgreSQL database, and a single Alembic migration stream.

### Structure

- `backend/app/`
  Application infrastructure and wiring.
  Examples: app startup, DB sessions, logging, configuration.
- `backend/platform/identity/`
  Users, installations, session auth, profile services and profile API.
- `backend/platform/content/`
  Question bank, categories, favorites, quiz templates, reusable content contracts.
- `backend/games/friends_game/`
  Live game sessions, participants, answers, score overrides, results, resume, sockets, local runtime state, local cache.
- `backend/shared/`
  Small generic helpers only.

### Compatibility Policy

- Public HTTP paths stay unchanged.
- Socket event names and payload contracts stay unchanged.
- Legacy root wrapper modules were removed after internal imports and tests were migrated to the new structure.

### Entry Point

- `backend.app.main:app`

### Extension Rule

New games should be added as separate modules under `backend/games/<new_game>/`.
Games must not import each other directly. Shared cross-game logic belongs in `backend/platform/` or, if truly generic and domain-neutral, in `backend/shared/`.
