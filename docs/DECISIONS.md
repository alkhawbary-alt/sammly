# Decision log

Newest first. Each entry: date · decision · why · how to revisit.

## 2026-10-28 · M3 admin & editor decisions
- **Admin auth:** access JWT (HS256, 15 min, audience `admin`) held **in memory** by the admin app. The rotating refresh token is an **httpOnly, SameSite=Lax cookie scoped to `/api/v1/admin/auth`**, so JavaScript never sees it. Only its SHA-256 is stored. Replaying a rotated token revokes the whole token family. Login responses are identical for unknown emails and wrong passwords (constant-time hash check), and login/refresh are rate-limited (10/min).
- **RBAC** is one `onRequest` guard on the `/admin` scope. `SUPER_ADMIN` can do everything, `SUPPORT` is read-only (GET), and routes can narrow access with `config.roles`. Tokens and cookies are redacted from logs.
- **Draft model:** `Template.draftData = { variants: [{ id, name, width, height, document }] }`. Variant 0 is the primary. The whole draft is saved with an optimistic `draftRevision` (409 on mismatch; the editor shows "changed elsewhere → reload"). Publishing copies the draft into an immutable `TemplateVersion`.
- **Fields across sizes:** a field's definition (label, type, constraints, source, AI…) is kept identical in every variant by the editor. Bindings are per variant. Publishing blocks if any variant lacks a key or the types differ.
- **"Duplicate as new size"** = uniform scale-to-fit + centre (`resizeDocument` in `template-schema`, which also scales fonts, fit sizes, baselines, shadows and strokes). The admin then fixes the layout by hand, as the brief intends.
- **"Convert to image slot"** turns a raster (e.g. the PSD's smart-object photo) into an `imageSlot` whose placeholder is the original pixels. That's what accepting a `zone:`/`@photo` suggestion does.
- **Mapping a missing font** in the editor applies the library font to every text layer in every variant that uses that PSD font name, **and adds the PSD name as an alias**, so future imports map it automatically.
- **Editor preview iframe:** `sandbox="allow-scripts allow-same-origin"`. With an opaque origin, Chrome's local-network rules block the `localhost` asset URLs in dev. The page's CSP still allows only the nonce'd auto-fit script, so injected markup can't run code.
- **Manually added layers are unlocked** (drag/resize on the canvas). Imported layers stay locked (numeric edits only) to keep the design identity, as the brief says. Either can be toggled per layer.
- **Image uploads** are sniffed by magic bytes, EXIF auto-oriented, stripped of metadata and capped at 4096px. PNG keeps transparency (backgrounds, foregrounds, masks).
- **UI kit:** small hand-written Tailwind primitives in `components/ui.tsx` (shadcn-style), rather than running the shadcn CLI. TanStack Query handles data.

## 2026-10-28 · M2 import pipeline decisions
- **Import model: "bake below, live above".** Everything below the first *live* layer is composited into one exact background PNG by our own Photoshop-compatible compositor. Live layers are visible text, raster smart objects covering ≥4% of the canvas (photos the admin may turn into slots), and layers tagged `@…`/`field:`/`zone:`/`slot:`. From the first live layer up, each layer is emitted individually: text stays live; everything else becomes a raster with its mask, effects and fill opacity baked in, and its blend mode mapped to CSS.
  *Why:* identity layers in the background are pixel-exact (adjustments, LUTs, special blend modes included). The only approximations happen above live content, and QA measures them.
- **The compositor reproduces** all 27 Photoshop blend modes (Skia natively, plus per-pixel linear burn/light, vivid/pin light, hard mix, darker/lighter colour, subtract, divide), the "special eight" fill-opacity rule, raster masks (density, feather), clipping groups, pass-through vs isolated groups, drop/inner shadow, outer glow, colour/gradient overlay and stroke, and curves, levels, hue/saturation, brightness/contrast, `.cube` colour lookup, gradient map, invert, posterize, threshold and exposure. It reports bevel, satin, pattern overlay, inner glow and non-cube LUTs as not reproduced.
- **CSS blend gaps:** `linear dodge` maps exactly to `plus-lighter`. Linear burn/light, vivid/pin light, hard mix and the rest are approximated and listed in the import report.
- **Text geometry:** size = font size × √|det(transform)|, rotation = atan2(b, a). Point text gets a generous box around the anchor (alignment side fixed), plus `baseline` so the browser puts the first line exactly on Photoshop's baseline (measured in-page with a zero-size marker). **Justification is mapped logically** (`left` → start, `right` → end), verified on the owner's PSDs: in Arabic (Middle-Eastern composer) layers, Photoshop's `left` is anchored at the right edge.
- **Imported text fields default to `fit: shrink`** (min 60% of the designed size); paragraph text uses `wrap-shrink`. Tracking is kept in the document but never applied to Arabic.
- **PSD parsing runs in a child process** with `--max-old-space-size=IMPORT_MAX_MEMORY_MB` (4096) and is killed after `IMPORT_TIMEOUT_MS` (60 s). QA then renders with the worker's shared Chromium.
- **Queue:** the `Job` table is the source of truth. The default `pg` driver claims rows with `FOR UPDATE SKIP LOCKED` (several workers are safe), retries with backoff, and re-queues jobs stuck in RUNNING. The BullMQ driver (`QUEUE_DRIVER=bullmq`) is not implemented yet; it would only deliver job ids.
- **Storage:** `STORAGE_DRIVER=local` serves HMAC-signed, expiring URLs from the API (`/api/v1/storage/:token`, PUT with a size cap, GET read-only); `s3` uses real presigned URLs (MinIO/R2). Uploaded files are checked by **magic bytes** before use.
- **`@sammly/db` (Prisma 7 + `@prisma/adapter-pg`) and `@sammly/platform` (config, storage, assets, queue, fonts)** are added to the brief's package list, because the API and the worker both need them.
- **Fonts are stored as WOFF2** (TTF/OTF converted with `wawoff2`). A variable font registered at several weights shares one asset (same sha256). Aliases are matched case-insensitively.
- **Owner PSDs are committed with Git LFS** (`fixtures/psd/*.psd`). One file is 112 MB, over GitHub's 100 MB per-file limit for plain git. The real-fixture acceptance test still skips when they are absent. CI checks out with `lfs: true`.
- **Known issue:** in "تهنئة مولودة", the Photoshop *Generative Fill* smart object's stored pixels differ from what the saved composite shows (the hands are pinker in the composite). Nothing in the file explains it, so the importer uses the stored pixels. That file also uses two non-free fonts (Adobe Arabic, Barada Reqa), which are correctly reported missing.
- **Admin endpoints from M2 are not authenticated yet**; auth lands at the start of M3.

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
