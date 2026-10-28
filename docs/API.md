# API endpoints

Base: `http://localhost:4000`. Versioned routes live under `/api/v1`. OpenAPI UI: **`/api/v1/docs`** (generated from the Zod schemas). The full plan is in the build brief §10; this file tracks what is implemented.

Errors always use `{ "error": { "code", "message", "details?" } }` with codes from `@sammly/shared` (`ErrorCode`).

| Method | Path | Auth | Since | Notes |
|---|---|---|---|---|
| GET | `/health` | — | M0 | Liveness (api; worker on :4001) |
| GET | `/ready` | — | M0 | DB connectivity; 503 when not ready |
| GET | `/api/v1/` | — | M0 | Version banner |
| PUT | `/api/v1/storage/:token` | signed URL | M2 | Local storage driver only: upload to a presigned key (size-capped) |
| GET | `/api/v1/storage/:token` | signed URL | M2 | Local storage driver only: read a presigned key |
| POST | `/api/v1/admin/uploads/presign` | admin* | M2 | `{kind: psd\|font\|image, mime, bytes, fileName?}` → `{key, url, method, headers, expiresAt}`; PSD ≤ 200 MB, font ≤ 10 MB, image ≤ 20 MB |
| POST | `/api/v1/admin/imports` | admin* | M2 | `{sourceKey, fileName, templateId?}` → **202** `{importId, jobId}`; rejects non-PSD files by magic bytes |
| GET | `/api/v1/admin/imports` | admin* | M2 | Last 50 imports |
| GET | `/api/v1/admin/imports/:id` | admin* | M2 | Status, QA `{score, warning (<95), diffUrl, renderUrl}`, import report, draft document, signed URLs for every referenced asset |
| GET | `/api/v1/admin/jobs/:id` | admin* | M2 | Job status/result/error/duration |
| GET | `/api/v1/admin/fonts` | admin* | M2 | Font library with aliases and signed WOFF2 URLs |
| POST | `/api/v1/admin/fonts` | admin* | M2 | `{sourceKey, family, weight, style, aliases[], scripts[], license?}`; TTF/OTF converted to WOFF2 |
| PATCH | `/api/v1/admin/fonts/:id` | admin* | M2 | Update family/weight/aliases (map a missing PSD font = add its alias) |
| DELETE | `/api/v1/admin/fonts/:id` | admin* | M2 | Soft delete |

\* Admin JWT auth arrives at the start of M3; until then these routes are open on the dev machine.

## Upload flow
1. `POST /admin/uploads/presign` → `url` (S3/R2 presigned PUT, or the API's signed local URL).
2. `PUT <url>` with the file bytes and the returned headers.
3. Call the endpoint that consumes `key` (`/admin/imports`, `/admin/fonts`).

## Import flow
`POST /admin/imports` → 202 → poll `GET /admin/jobs/:jobId` (or `GET /admin/imports/:id`) until `SUCCEEDED`/`FAILED`. Smoke test: `pnpm tsx scripts/e2e-import.ts "fixtures/psd/<file>.psd"`.
