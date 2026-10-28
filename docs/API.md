# API endpoints

Base: `http://localhost:4000`. Versioned routes live under `/api/v1`. OpenAPI UI: **`/api/v1/docs`** (generated from the Zod schemas). The full plan is in the build brief آ§10; this file tracks what is implemented.

Errors always use `{ "error": { "code", "message", "details?" } }` with codes from `@sammly/shared` (`ErrorCode`).

| Method | Path | Auth | Since | Notes |
|---|---|---|---|---|
| GET | `/health` | â€” | M0 | Liveness (api; worker on :4001) |
| GET | `/ready` | â€” | M0 | DB connectivity; 503 when not ready |
| GET | `/api/v1/` | â€” | M0 | Version banner |
| PUT | `/api/v1/storage/:token` | signed URL | M2 | Local storage driver only: upload to a presigned key (size-capped) |
| GET | `/api/v1/storage/:token` | signed URL | M2 | Local storage driver only: read a presigned key |
| POST | `/api/v1/admin/uploads/presign` | admin | M2 | `{kind: psd\|font\|image, mime, bytes, fileName?}` â†’ `{key, url, method, headers, expiresAt}`; PSD â‰¤ 200 MB, font â‰¤ 10 MB, image â‰¤ 20 MB |
| POST | `/api/v1/admin/imports` | admin | M2 | `{sourceKey, fileName, templateId?}` â†’ **202** `{importId, jobId}`; rejects non-PSD files by magic bytes |
| GET | `/api/v1/admin/imports` | admin | M2 | Last 50 imports |
| GET | `/api/v1/admin/imports/:id` | admin | M2 | Status, QA `{score, warning (<95), diffUrl, renderUrl}`, import report, draft document, signed URLs for every referenced asset |
| GET | `/api/v1/admin/jobs/:id` | admin | M2 | Job status/result/error/duration |
| GET | `/api/v1/admin/fonts` | admin | M2 | Font library with aliases and signed WOFF2 URLs |
| POST | `/api/v1/admin/fonts` | admin | M2 | `{sourceKey, family, weight, style, aliases[], scripts[], license?}`; TTF/OTF converted to WOFF2 |
| PATCH | `/api/v1/admin/fonts/:id` | admin | M2 | Update family/weight/aliases (map a missing PSD font = add its alias) |
| DELETE | `/api/v1/admin/fonts/:id` | admin | M2 | Soft delete |

| POST | `/api/v1/admin/auth/login` | — | M3 | `{email, password}` → `{accessToken (15 min), user}` + httpOnly refresh cookie; rate-limited |
| POST | `/api/v1/admin/auth/refresh` | cookie | M3 | Rotates the refresh token → new access token; reuse revokes the family |
| POST | `/api/v1/admin/auth/logout` | cookie | M3 | Revokes the session |
| GET | `/api/v1/admin/auth/me` | admin | M3 | Current admin |
| GET | `/api/v1/admin/dashboard/stats` | admin | M3 | Counts |
| GET/POST | `/api/v1/admin/categories` | admin | M3 | List (flat, with parentId + templateCount) / create |
| PATCH/DELETE | `/api/v1/admin/categories/:id` | admin | M3 | Delete refuses categories with templates/children (409) |
| POST | `/api/v1/admin/categories/reorder` | admin | M3 | `{ids[]}` sibling order |
| GET | `/api/v1/admin/templates` | admin | M3 | Filters: `status, categoryId, visibility, minPlan, q` |
| POST | `/api/v1/admin/templates` | admin | M3 | `{title, categoryId?, fromImportId}` or `{…, manual: {width, height, background}}` → 201 |
| GET | `/api/v1/admin/templates/:id` | admin | M3 | Meta + draft + revision + signed asset URLs + font files + imports |
| PATCH | `/api/v1/admin/templates/:id` | admin | M3 | Meta: title, categoryId, tags, minPlan, visibility, activityTypes |
| PUT | `/api/v1/admin/templates/:id/draft` | admin | M3 | `{revision, draft}` → `{revision}`; **409** if the revision moved |
| POST | `/api/v1/admin/templates/:id/variants` | admin | M3 | `{revision, fromImportId}` or `{revision, duplicateOf, width, height, name?}` |
| POST | `/api/v1/admin/templates/:id/validate` | admin | M3 | `{ok, problems[]}` |
| POST | `/api/v1/admin/templates/:id/publish` | admin | M3 | → `{versionId, version}`; 400 with problems |
| POST | `/api/v1/admin/templates/:id/unpublish` · `/duplicate` | admin | M3 | Archive / copy as new draft |
| GET | `/api/v1/admin/templates/:id/versions` | admin | M3 | Immutable published versions |
| PUT | `/api/v1/admin/templates/:id/access` | admin | M3 | `{businessIds[]}` for PRIVATE templates |
| POST | `/api/v1/admin/templates/:id/test-render` | admin | M3 | `{variantId, values, quality}` → 202 `{jobId}`; job result has a signed `url` |
| DELETE | `/api/v1/admin/templates/:id` | admin | M3 | Soft delete |
| POST | `/api/v1/admin/assets` | admin | M3 | `{sourceKey, kind: LAYER\|UPLOAD}` → `{id, url, width, height}` (EXIF-oriented, metadata stripped) |
| POST | `/api/v1/admin/assets/urls` | admin | M3 | `{ids[]}` → signed URLs |

Every `/api/v1/admin/*` route (except login/refresh/logout) needs `Authorization: Bearer <accessToken>`. Roles: `SUPER_ADMIN` all; `TEMPLATE_EDITOR` all current routes; `SUPPORT` read-only.

## Upload flow
1. `POST /admin/uploads/presign` â†’ `url` (S3/R2 presigned PUT, or the API's signed local URL).
2. `PUT <url>` with the file bytes and the returned headers.
3. Call the endpoint that consumes `key` (`/admin/imports`, `/admin/fonts`).

## Import flow
`POST /admin/imports` â†’ 202 â†’ poll `GET /admin/jobs/:jobId` (or `GET /admin/imports/:id`) until `SUCCEEDED`/`FAILED`. Smoke test: `pnpm tsx scripts/e2e-import.ts "fixtures/psd/<file>.psd"`.
