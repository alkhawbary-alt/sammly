# Decision log

Newest first. Each entry: date · decision · why · how to revisit.

## 2026-10-28 · M1 renderer decisions
- **Text alignment is physical, fixed by layer direction.** `start/end` become `right/left` according to the layer's `direction` at build time. The brief requires `unicode-bidi: plaintext` (so phone numbers, prices and handles order correctly inside Arabic), and with plaintext a line that starts with a digit or Latin letter would flip a logical `start`. `direction: 'auto'` keeps logical values. *Verify against real PSD composites in M2 (brief §7.3).*
- **Line height and tracking are emitted relative to the font size** (unitless `line-height`, `letter-spacing` in `em`; run sizes in `em`) so auto-fit shrinking scales them.
- **Library fonts use a private CSS family** (`sf-<fontId>`), so an installed system font with the same name can never be used instead of the uploaded file. A mapped face draws at its own weight (no synthetic bold).
- **Empty vs missing values.** `undefined` keeps the layer as designed (the designer's sample text or placeholder); `''`/`null` means intentionally empty: text becomes empty, slots show `emptyColor`, and layers bound with `prop: 'visible'` are hidden. Precedence: locked brand value → user value → brand value → field default → design.
- **`visible` bindings** hide the layer when the value is empty. This is how optional elements (a phone icon next to an optional phone number) work, without a separate boolean field type.
- **Path masks use CSS `clip-path: path()`** (slot-local pixel coordinates) instead of an inline SVG `<clipPath>`. It gives the same result in Chromium with less markup.
- **Clipping masks:** a `raster` with `clipping: true` is masked by the alpha of the raster/image directly below it (CSS `mask-image` offset to that layer). Other bases are flattened by the importer.
- **`scale` is not a `buildRenderHtml` option.** Pixel ratio (preview 0.5, standard 1, HD 2) is the Playwright `deviceScaleFactor`, so the HTML is identical for every quality and stays cacheable.
- **Export pages are served from `https://assets.local/__page`**, so fonts and masks are same-origin. Every other request is aborted, and a CSP allows only `assets.local`/`data:` plus the nonce'd auto-fit script.
- **Golden images are per platform** (`test/golden/<platform>/`), because font rasterization differs between Windows and Linux. A missing golden is created locally and skipped on CI until a Linux golden is committed (run `pnpm golden:update` on Linux/CI once).
- **Fixture fonts:** IBM Plex Sans Arabic (OFL, from `@ibm/plex-sans-arabic`), Regular and Bold, in `fixtures/fonts/`. Fontsource's Cairo/Tajawal split Arabic and Latin into separate subset files; the one-file-per-font model would lose Latin digits/spaces. Full TTFs for Cairo/Tajawal (Google Fonts, OFL) will be added for the seed in M2.
- **Renderer purity is enforced by tsconfig:** `src/` typechecks without Node or DOM types. Node-only helpers (Playwright page renderer, pixel diff) live in the `@sammly/renderer-html/qa` subpath.

## 2026-10-28 · Docker-free dev mode (`INFRA_MODE=embedded`)
- **Decision:** `pnpm dev` defaults to an embedded PostgreSQL (`embedded-postgres`, data in `.data/pg`, port 5433), local-disk object storage (`.data/storage`) and a Postgres-backed queue. `docker-compose.yml` (postgres 16, redis 7, minio) is kept and used with `INFRA_MODE=docker`.
- **Why:** The dev machine has no Docker. The brief's architecture is unchanged: storage and queue sit behind interfaces (`STORAGE_DRIVER=local|s3`, `QUEUE_DRIVER=pg|bullmq`), so production uses S3/R2 and BullMQ/Redis with no code changes.
- **Revisit:** Once Docker is available, set `INFRA_MODE=docker`, `STORAGE_DRIVER=s3`, `QUEUE_DRIVER=bullmq` in `.env`.

## 2026-10-28 · Next.js 16 instead of 15
- **Decision:** The admin uses Next.js 16 (App Router), current stable at build time.
- **Why:** 15 is no longer the current line; there are no API differences that matter for this app.

## 2026-10-28 · TypeScript 6.0.x, not 7
- **Decision:** Pin `typescript ~6.0.3`.
- **Why:** `typescript-eslint` supports `<6.1`, and Next's type plugin uses the JS compiler API that the native TS 7 doesn't expose yet.
- **Revisit:** When typescript-eslint supports TS 7.

## 2026-10-28 · Internal packages ship TypeScript source
- **Decision:** `packages/*` export `./src/index.ts` directly ("just-in-time" packages). API and worker run through `tsx`, the admin through `transpilePackages`, and tests through Vitest.
- **Why:** No build step or watch chain between packages in dev. Production images can bundle with `tsup`/esbuild later.

## 2026-10-28 · pnpm 12 via corepack in the user directory
- **Decision:** `packageManager: pnpm@12.15.0`. Dependencies allowed to run install scripts are listed in `pnpm-workspace.yaml → allowBuilds`.

## 2026-10-28 · Prisma deferred until the first DB model (M2/M3)
- **Decision:** M0 only checks DB connectivity with `pg`. Prisma comes in on the 7.x stable line (8 is still RC).
