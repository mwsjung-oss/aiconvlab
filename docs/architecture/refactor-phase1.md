# Phase 1 architecture refactor (AILab)

## Goals

- Keep existing local dev flows (`npm run dev`, Vite proxy, optional `dev:stack`) working.
- Separate **browser-visible config** (Vite `VITE_*`) from **server secrets** (backend `.env` only).
- Remove **hardcoded lab IPs** from frontend source; targets come from env files.
- Add clear folder boundaries for frontend `services/*`, backend `src/core`, `docs/architecture`, `infra`.
- Prepare static hosting (e.g. **Cloudflare Pages**) by relying on `VITE_API_BASE_URL` or same-origin `/api`.

## Frontend

### Layout

| Path | Role |
|------|------|
| `frontend/src/services/config/` | Public env accessors (`import.meta.env`), no secrets |
| `frontend/src/services/runtime/` | Backend mode cookie/localStorage, dev bootstrap helpers |
| `frontend/src/services/api/` | `fetch` client, timeouts, URL building |
| `frontend/src/api/*.ts` | Thin re-exports for existing import paths |

### Environment variables

- **`VITE_API_BASE_URL`**: Set for static deploys so the SPA calls a single configurable API origin. Empty => relative `/api` (Vite proxy in dev/preview).
- **`VITE_LOCAL_API_URL`**: Default proxy target for cookie mode `local` (still defaults to `http://127.0.0.1:8000` for convenience).
- **`VITE_LAB_API_URL`**: Lab/staging API; **no default in code**. Required for lab cookie mode + proxy.
- **`VITE_DEV_PROXY_TARGET`**: Legacy alias for `VITE_LAB_API_URL` (vite.config and `getLabApiUrlWithLegacyFallback()`).
- **`VITE_AWS_API_URL`**: Cloud target for cookie mode `aws`.
- **`VITE_APP_ENV`**: Optional public deploy label (defaults to Vite `MODE`).

### Vite plugins

- `vite-plugin-ailab-api-proxy.mjs`: Adds **lab** empty-URL guard (503) alongside existing **aws** guard.
- `vite-plugin-ailab-local-api.mjs`: Lab health endpoints fail fast if lab URL is unset.

### Cloudflare Pages

1. Build the SPA with `VITE_API_BASE_URL=https://your-api.example.com` (or put the API on the same host behind `/api`).
2. Do **not** put provider API keys in `VITE_*`. All paid/secret calls stay on the backend.

## Backend

### Layout

| Path | Role |
|------|------|
| `backend/src/core/settings.py` | `get_settings()` — expand over time |
| `backend/src/core/cors.py` | `cors_middleware_params()` extracted from `main.py` |
| `backend/src/api`, `services`, `runtimes`, `providers` | Phase-1 placeholders (`TODO` in `__init__.py`) |

`main.py` prepends `backend/src` to `sys.path` so `from core.cors import ...` works without changing the uvicorn module path.

### Environment

- New documented keys in `backend/.env.example`: **`AILAB_ENV`** / **`ENVIRONMENT`** (read by `get_settings()`).
- Existing secrets (JWT, SMTP, `OPENAI_API_KEY`, etc.) stay server-side only.

## Migration checklist

1. **Lab users**: Set `VITE_LAB_API_URL` or `VITE_DEV_PROXY_TARGET` in `frontend/.env` / `.env.lab` (previously some IPs were baked into Vite defaults).
2. **`dev:lab`**: `frontend/scripts/dev-web-lab.mjs` waits on `VITE_LAB_API_URL` or legacy `VITE_DEV_PROXY_TARGET`.
3. **Imports**: Prefer `services/*` for new code; old `src/api/*` paths remain valid via re-exports.

## Follow-up (TODO)

- Move `backend/routers` under `backend/src/api` with package imports.
- Centralize more `os.getenv` usage into `core/settings.py`.
- Add Cloudflare-specific `infra` notes (Workers, Pages env UI) when deploying.
