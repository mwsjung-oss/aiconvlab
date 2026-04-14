# Runtime / Provider Phase 2

## Scope

This phase introduces a platform abstraction layer for execution runtimes and external providers without breaking existing local workflows.

## Runtime Layer

- Base contracts:
  - `backend/src/runtimes/base.py`
  - `RuntimeDispatchRequest`, `RuntimeDispatchResult`, `RuntimeJobStatus`
- Adapters:
  - `LocalRuntime`
  - `LabRuntime` (safe placeholder)
  - `CloudRuntime` (safe placeholder)
- Selection/registry:
  - `backend/src/runtimes/registry.py`
  - Selection uses request runtime first, then `AILAB_DEFAULT_RUNTIME`
  - Allowed set is enforced via `AILAB_ALLOWED_RUNTIMES`

## Provider Layer

- Base contracts:
  - `backend/src/providers/base.py`
  - `LLMProvider`, `CloudProvider`, `ProviderStatus`
- Adapters:
  - `OpenAIProvider`
  - `GeminiProvider`
  - `MockLLMProvider`
  - `AWSCloudProvider`
  - `MockCloudProvider`
- Registry:
  - `backend/src/providers/registry.py`

Providers are **disabled by default**. When disabled or missing credentials, status endpoints return safe, structured states (`disabled`, `not_configured`, `placeholder`) and no external call is executed.

## API Endpoints

Added in `backend/src/api/v1/platform.py` and included by `main.py`.

- `GET /health` (already present; unchanged)
- `GET /config` and `GET /api/config`
- `GET /runtimes` and `GET /api/runtimes`
- `POST /jobs/dispatch` and `POST /api/jobs/dispatch`
- `GET /jobs/{job_id}/status` and `GET /api/jobs/{job_id}/status`
- `GET /providers/status` and `GET /api/providers/status`

`/jobs/dispatch` currently uses in-memory status tracking (`services/platform/job_store.py`):
- `local`: accepted and completed quickly (safe local path)
- `lab`/`cloud`: structured placeholder responses

## Frontend Integration

- Runtime persistence:
  - `frontend/src/services/runtime/selectedRuntime.ts`
- New system page:
  - `frontend/src/pages/SystemStatusPage.jsx`
- `App.jsx` updates:
  - Adds `System` top tab
  - Stores selected runtime in app state + localStorage
  - Polls `/api/health`, `/api/config`, `/api/runtimes`, `/api/providers/status`
- Status badges:
  - `Ready`
  - `Disabled`
  - `Not configured`
  - `Placeholder`
  - `Connected`

## Notes / TODO

- Migrate existing legacy job endpoints onto runtime adapters in a later phase.
- Replace in-memory job store with persistent queue.
- Add real lab/cloud executor implementations behind feature flags.
