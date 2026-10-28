# API endpoints

Base: `http://localhost:4000`. Versioned routes live under `/api/v1`. The full list is planned in the build brief §10; this file tracks what is implemented.

| Method | Path | Auth | Status | Notes |
|---|---|---|---|---|
| GET | `/health` | — | ✅ M0 | Liveness (api & worker :4001) |
| GET | `/ready` | — | ✅ M0 | DB connectivity; 503 when not ready (api & worker) |
| GET | `/api/v1/` | — | ✅ M0 | Version banner |

Errors always use `{ "error": { "code", "message", "details?" } }` with codes from `@sammly/shared` (`ErrorCode`).
