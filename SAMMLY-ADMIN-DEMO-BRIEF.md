# Sammly (صمملي) — Build Brief: Core Services + Admin Website (Demo)

> **For Claude Code.** This is the brief for building the first demo of the Sammly platform. Read all of it before writing code. Work milestone by milestone (§15) and do not start a milestone until the previous one meets its acceptance criteria. When something here is ambiguous, pick the simplest option that keeps the **Template Document** (§5) the single source of truth, write the decision in `docs/DECISIONS.md`, and keep going.
>
> The working POC lives in `./POC` (see §3). Read `POC/POC-FINDINGS.md` and the files listed in §3.2 before starting M1.

---

## 1. Product context (short)

Sammly is a mobile app (Android/iOS, later) where businesses make their routine social-media designs — holidays, congratulations, offers, announcements — by **picking a ready-made template and filling in a form**. It is *not* an open editor like Canva: templates are designed in advance and their identity is locked; only fields marked as editable can be changed.

User flow (mobile, later; simulated in the admin for the demo):
`Category → Template → Fill text/image fields → Pick size & quality → Preview → Download/Share`

Admin flow to add a template (from the product spec):
`Add template → Set size → Upload PSD (or Background + Foreground + Mask) → Mark the dynamic image → Mark/position text fields → AI instructions → Assign plans/businesses → Save & publish` — plus **Duplicate template** to speed up similar templates.

Plans: **Basic** (auto-composition, standard export, very limited AI), **Business** (more templates, HD, text rewriting, background removal, light image enhancement), **Pro** (everything plus multiple sizes, several design options, high AI credit, marketing assistant). AI is always **credit-limited** per plan.

**This phase:** the core services (template import, template document, render engine, API) and the **admin website**. The API must be ready for the mobile app (stateless, JWT, versioned REST), but no mobile code is written now.

---

## 2. Demo scope

### In scope
1. **Template import**: PSD → Template Document JSON + extracted assets + import report, run as a background job.
2. **Manual composition** (no PSD): Background + Foreground + optional Mask + dynamic image slot + text fields, producing the same Template Document.
3. **Template editor / field tagging** in the admin: layer tree, canvas preview, turn layers into form fields, set constraints, test-fill live.
4. **Font library**: upload fonts and map them to PSD font names; the renderer embeds them. Arabic fonts first-class.
5. **Render engine**: Template Document + field values → PNG/JPG/PDF in a chosen size and quality, through a queue and worker.
6. **Template management**: categories, tags, draft/published, immutable versions, duplicate, multiple size variants.
7. **Businesses & plans (minimal)**: business accounts, plan assignment, template visibility (public-by-plan or private to specific businesses), brand kit for auto-filling fields.
8. **Customer simulator** in the admin: pick a business and walk through the end-user flow (browse what they can see → fill form → render → download). This stands in for the mobile app in the demo.
9. **AI (minimal)**: AI credit ledger plus one real feature — rewriting text for a field — that uses the business AI profile and the template's AI instructions.
10. **App-facing REST API** (`/api/v1/app/*`) that the simulator uses and the mobile app will use later.

### Out of scope for the demo (design the schema so they fit later)
Mobile app · payments/Stripe (subscriptions are set manually by an admin) · Illustrator `.ai` import · designer marketplace & commissions · Meta Business publishing / N8N · the marketing assistant chat · app-help assistant & knowledge base · background removal & image enhancement (keep the interface stubbed, §12) · push notifications · reports beyond simple counts.

---

## 3. What the POC proved and what to carry over

### 3.1 Findings (from `POC/POC-FINDINGS.md`)
- Pipeline `PSD → Normalized JSON → HTML/CSS → Chromium (Playwright) → PNG/PDF` works; **97.6% pixel match** with the Photoshop composite.
- `ag-psd` + `@napi-rs/canvas` is the parser of choice (beat `psd.js`, `node-psd-to-html`, `psd2fabric`).
- **Hybrid representation**: text → editable HTML text, solid shapes → CSS, anything complex (effects, adjustments, masks, gradients, odd blend modes) → **raster fallback PNG**. No visual loss.
- One HTML/CSS generator powers both the live preview and the headless export, so they never diverge.
- Point-text coordinates from `ag-psd` are often `NaN`; derive them from `text.transform` with baseline correction (already done in the POC).
- Fabric.js output was evaluated and **rejected** as the main target. Do not carry it over.

### 3.2 Files to port (refactor, don't copy blindly)
| POC file | Goes to | Notes |
|---|---|---|
| `src/types/design.ts` | `packages/template-schema` | Base for §5; extend heavily. |
| `src/importers/psdImporter.ts` | `packages/importer-psd` | Make it storage-agnostic (return buffers; caller uploads). |
| `src/importers/imageImporter.ts`, `svgImporter.ts` | `packages/importer-psd` (or `importer-basic`) | Used by manual composition. |
| `src/generator/htmlGenerator.ts` | `packages/renderer-html` | Becomes the one HTML builder. Pure function, no I/O. |
| `src/rendering/playwrightRenderer.ts` | `apps/worker` | Shared browser pool; remove the hardcoded `localhost:3001`. |
| `src/rendering/visualDiff.ts` | `packages/renderer-html` (QA) | Used for import QA (§6.4). |
| `client/src/CanvasPreview.tsx`, `CanvasSelectionOverlay.tsx`, `Rulers.tsx`, `TextSidebar.tsx`, `utils/layerUtils.ts` | `apps/admin` template editor | Port to the admin's component system. |
| `tests/poc.test.ts` | `packages/*/test` | Keep as regression tests. |

Leave out: `comparisons/`, `psdJsExplorer.ts`, `nodePsdToHtml.ts`, `fabricGenerator.ts`, `GithubLab.tsx`, `/api/lab/*`, `/api/benchmark`.

### 3.3 Gaps in the POC that this phase must close
These are **not** in the POC and are required:
1. **Arabic / RTL text.** No `direction` handling anywhere. Arabic is the primary language of the templates. See §7.3.
2. **Fonts.** Text falls back to system fonts, so the output shifts. Fonts need an uploaded library and `@font-face` embedding. See §7.4.
3. **Fields.** The POC edits raw layers. The product needs a separate **field definition** layer (key, label, type, constraints, bindings). See §5.3.
4. **Image slots with masks.** Masks/clipping currently become rasters, so a user photo can't be placed *inside* a shape (circle, frame). See §7.5.
5. **Text runs.** Only the first style is read; multi-style text (`text.styleRuns`) is flattened. Support runs for non-editable text at least; editable fields can use one style.
6. **Box vs point text.** Use `text.shapeType` / `text.boxBounds` from `ag-psd` for paragraph text boxes instead of estimating width from character count.
7. **Asset URLs.** The renderer depends on `http://localhost:3001`. It must resolve assets from object storage (§7.1).
8. **Text overflow.** No auto-fit; long user text overflows. See §7.6.
9. **Persistence, queues, auth, multi-tenant visibility.** Not in the POC at all.

---

## 4. Architecture

```
                ┌───────────────────────┐        ┌──────────────────────┐
                │  apps/admin (Next.js) │        │ mobile app (later)   │
                │  RTL Arabic, EN toggle│        │ uses /api/v1/app/*   │
                └──────────┬────────────┘        └──────────┬───────────┘
                           │ REST/JSON (JWT)                │
                    ┌──────▼────────────────────────────────▼──────┐
                    │          apps/api  (Fastify + Zod)           │
                    │  auth · templates · fonts · businesses ·     │
                    │  plans · designs · ai · uploads (presigned)  │
                    └───┬──────────────┬──────────────┬────────────┘
                        │ Prisma       │ BullMQ       │ S3 API
                 ┌──────▼─────┐  ┌─────▼─────┐  ┌─────▼──────────────┐
                 │ PostgreSQL │  │   Redis   │  │ MinIO (dev)        │
                 └────────────┘  └─────┬─────┘  │ Cloudflare R2(prod)│
                                       │        └─────▲──────────────┘
                              ┌────────▼────────────┐ │
                              │ apps/worker         │─┘
                              │ queues: import,     │
                              │ render, ai          │
                              │ Playwright pool     │
                              └─────────────────────┘
```

- **The API never renders or parses PSDs inline.** It creates a job and returns `202` with a job id; clients poll `GET /jobs/:id` (SSE optional later).
- **The worker** runs Playwright (Chromium) with a pool of N browser contexts (env `RENDER_CONCURRENCY`, default 2) and `ag-psd` for imports.
- **The renderer HTML builder is a pure shared package**, used by the worker (export) and the admin (live preview in an iframe). Same input → same HTML.

### 4.1 Tech stack (decided for the demo)
| Layer | Choice | Why |
|---|---|---|
| Monorepo | **pnpm workspaces + Turborepo**, TypeScript strict | Shared schema/renderer packages. |
| API | **Fastify 5 + Zod** (`fastify-type-provider-zod`), OpenAPI generated from Zod | Continuity with the POC; same schemas front and back. |
| ORM / DB | **Prisma + PostgreSQL 16** | |
| Queue | **BullMQ + Redis 7** | Matches the technical study. |
| Storage | **S3-compatible client** (`@aws-sdk/client-s3`); **MinIO** in dev, **Cloudflare R2** in prod | Same code both environments. |
| Render | **Playwright Chromium** | Proven in the POC. |
| PSD | **ag-psd + @napi-rs/canvas**, **sharp** for image ops | Proven in the POC. |
| Admin | **Next.js 15 (App Router) + Tailwind + shadcn/ui + TanStack Query**, `next-intl` | Arabic RTL by default, English secondary. |
| Auth | Own JWT (access 15 min + refresh rotation), `argon2` password hashing | Same tokens for admin and app users; roles differ. |
| AI | Provider interface; Anthropic SDK implementation, model from env `AI_MODEL` | §12. |
| Tests | **Vitest** (unit), **Playwright Test** (admin E2E), golden-image tests for the renderer | |
| Dev infra | **docker-compose**: postgres, redis, minio (+ bucket init) | One command to start. |

### 4.2 Repository layout
```
sammly/
  apps/
    api/                 Fastify REST API
    worker/              BullMQ workers: import, render, ai
    admin/               Next.js admin website
  packages/
    template-schema/     Zod schemas + TS types for the Template Document, fields, values (§5)
    renderer-html/       buildRenderHtml(doc, values, opts) → HTML string; auto-fit script; visual diff
    importer-psd/        PSD → Template Document draft + asset buffers + import report
    shared/              constants, error codes, plan feature flags, i18n keys
    config/              eslint, tsconfig, tailwind presets
  fixtures/
    psd/                 real PSD templates for tests (Arabic first) — the owner will add these
    fonts/               a couple of freely-licensed Arabic fonts for tests (e.g. Cairo, Tajawal, IBM Plex Sans Arabic)
  docs/
    DECISIONS.md         decision log (mirrors the "technical decision log" in the project plan)
    API.md               generated / hand-maintained endpoint list
  POC/                   untouched reference
  docker-compose.yml
  .env.example
```

---

## 5. The Template Document (the core of everything)

The Template Document is JSON validated by Zod in `packages/template-schema`. It is the **only** thing the renderer needs. Every import path (PSD, manual) produces it; the editor edits it; publishing freezes it into a version.

It has three parts: **layers** (what is drawn), **fields** (what the user can change, and how), and **rules** (locks, AI policy).

### 5.1 Top level
```ts
TemplateDocument = {
  schemaVersion: 1,
  canvas: { width: number, height: number, background: string /* color */ },
  layers: Layer[],              // paint order: index 0 = bottom
  fields: Field[],              // the form; order = form order
  fonts: FontRef[],             // font ids used by any layer
  rules: TemplateRules,
  meta: { source: 'psd' | 'manual' | 'duplicate', sourceFileName?: string,
          importReportId?: string, compositeAssetId?: string }
}
```

### 5.2 Layers
Carry over the POC types (`text`, `image`, `raster`, `shape`, `svg`, `group`), with these changes:
- Every asset reference is an **`assetId`** (a storage key in the DB), never a URL. The renderer resolves ids to URLs (§7.1).
- `id` is a stable short id (nanoid) that survives re-imports by layer path when possible.
- Common props: `name, x, y, width, height, rotation, opacity, visible, blendMode, locked: boolean (default true)`.
- `text` layer adds: `direction: 'rtl' | 'ltr' | 'auto'`, `textBox: 'point' | 'box'`, `runs?: TextRun[]` (multi-style, non-editable only), `fit: TextFit` (§7.6), `verticalAlign: 'top'|'middle'|'bottom'`, `style.fontId` (from the font library) plus `style.fontFamily` fallback.
- New layer type **`imageSlot`**: a box where a user/brand image goes.
  ```ts
  { type: 'imageSlot', ..., fit: 'cover' | 'contain',
    mask?: { kind: 'alpha', assetId } | { kind: 'path', svgPath: string } | { kind: 'shape', shape: 'circle'|'roundedRect', radius?: number },
    placeholderAssetId?: string, allowUserCrop: boolean }
  ```
- `raster`: also keeps `clipping?: boolean` so the importer can attach clipped layers to the base below them (Photoshop clipping masks) instead of always flattening.

### 5.3 Fields (the form definition)
A field is a **named input bound to one or more layer properties**. The layer stays the visual; the field says what the user may change.
```ts
Field = {
  key: string,                       // 'groom_name', unique per template, ^[a-z][a-z0-9_]*$
  label: { ar: string, en?: string },
  help?: { ar: string, en?: string },
  type: 'text' | 'textarea' | 'image' | 'color' | 'date' | 'phone' | 'select' | 'number',
  required: boolean,
  default?: unknown,
  bindings: Binding[],               // where the value goes
  constraints?: {                    // validated server-side AND in the form
    maxLength?: number, maxLines?: number, minLength?: number,
    options?: { value: string, label: {ar: string, en?: string} }[],  // select
    allowedColors?: string[],        // color: restrict to a palette (e.g. brand colors)
    image?: { minWidth?: number, minHeight?: number, maxMB?: number, mime?: string[] },
    dateFormat?: 'hijri' | 'gregorian' | 'both'   // display format for date fields (Saudi market)
  },
  source?: 'user' | 'brand.logo' | 'brand.name' | 'brand.phone' | 'brand.primaryColor'
         | 'brand.secondaryColor' | 'brand.website' | 'brand.instagram' | 'brand.address',
  // 'brand.*' → auto-filled from the business brand kit; user may override unless rules.lockBrandFields
  ai?: { rewrite: boolean, maxCredits?: number }   // which AI actions are allowed on this field
}

Binding =
  | { layerId, prop: 'text' }                 // text / textarea / date / phone / number / select
  | { layerId, prop: 'image' }                // imageSlot
  | { layerId, prop: 'fill' | 'color' | 'stroke' }  // color field → shape fill, text color, svg fill
  | { layerId, prop: 'visible' }              // boolean-ish: show/hide optional elements
```
One field can drive several layers (e.g. a `primary_color` field recolors three shapes; `business_name` appears twice).

**Field values** (what the user submits): `Record<fieldKey, FieldValue>` where an image value is `{ assetId, crop?: { x, y, scale } }`. Validate with a Zod schema **generated from the field list** (`buildValuesSchema(fields)`), shared by API and forms.

### 5.4 Rules
```ts
TemplateRules = {
  lockBrandFields: boolean,
  aiPolicy: { level: 'none' | 'text' | 'text+image', instructions?: string },
  // instructions = the "AI instructions per template" from the spec:
  // what can change, what must stay, how to write text, how to treat images.
  exportSizes: string[]   // variant ids allowed for export, see §8
}
```

### 5.5 Schema rules for Claude Code
- Bump `schemaVersion` on breaking changes and write a migration function `migrate(doc)`; published versions must always still render.
- Do **not** add renderer-specific fields (CSS strings, Fabric objects) to the document. The document describes the design; the renderer decides how to draw it.
- Ship JSON Schema generated from Zod in `packages/template-schema/dist/schema.json` (the mobile team will need it).

---

## 6. Import pipeline

### 6.1 PSD import (job `import:psd`)
1. Admin uploads a PSD with a **presigned PUT** to storage (`uploads/psd/{uuid}.psd`, limit 200 MB), then calls `POST /admin/imports` with the key.
2. The worker parses it with `ag-psd` (port of `psdImporter.ts`) and produces:
   - a **draft Template Document** (layers only; `fields: []`),
   - layer PNGs and the composite PNG uploaded as **Assets**,
   - an **Import Report**: counts editable/rasterized/skipped, unsupported features, **missing fonts** (PSD postscript names not mapped in the font library), warnings.
3. **Auto-suggest fields** (stored in the report, not applied): text layers whose names start with `@`, `field:` or `{{ }}` become suggested fields with that key; image/raster layers named `@photo`, `@logo` become suggested image slots. Write this naming convention into the admin help — designers can then tag in Photoshop and skip most manual work.
4. Run **visual QA**: render the draft with default values and pixel-diff it against the composite (POC `visualDiff.ts`). Store the score and a diff image. Under 95% → show a warning badge in the admin.
5. The job result is the draft; the admin opens it in the editor.

Importer improvements over the POC (required): RTL detection (§7.3), `styleRuns`, box text via `boxBounds`, clipping groups, layer masks on image layers become `imageSlot` masks when the layer is tagged as a slot, stable layer ids, font name → `fontId` mapping via the Font library aliases.

### 6.2 Manual composition (no PSD)
`POST /admin/templates` with `source: 'manual'`: the admin uploads **Background**, optional **Foreground** (transparent PNG drawn above the photo), optional **Mask**, then places an image slot and text boxes in the editor. This produces layers `[background raster, imageSlot(+mask), foreground raster, text…]` — the same document shape as an import.

### 6.3 Re-import
"Replace PSD" on an existing draft: re-run the import and **keep the field definitions** whose bound layers can be matched by layer path/name; list unmatched fields for the admin to fix.

### 6.4 Acceptance for the importer
On the owner's real PSDs in `fixtures/psd/` (ask for them if the folder is empty; use the POC samples meanwhile): ≥95% pixel match against the composite for at least 80% of files, Arabic text extracted as correct, readable strings in the right direction, and every missing font listed in the report.

---

## 7. Render engine

### 7.1 `packages/renderer-html`
```ts
buildRenderHtml(doc: TemplateDocument, values: FieldValues, opts: {
  resolveAsset: (assetId) => string,     // URL or data URI; injected by caller
  resolveFont:  (fontId)  => { family: string, url: string, weight, style },
  mode: 'preview' | 'export',
  scale?: number                          // export pixel ratio
}): { html: string }
```
Steps: apply values to a deep copy of the layers through the bindings → apply brand-kit defaults for `brand.*` fields with no value → emit `@font-face` for every used font → emit layers (port of `htmlGenerator.ts`) → inline the **auto-fit script** (§7.6). Pure function, no network, no DOM dependency at build time.

In the **worker**, resolve assets through Playwright `page.route('https://assets.local/**', …)` streaming from storage (no public URLs, no localhost dependency). In the **admin preview**, resolve to short-lived presigned GET URLs.

### 7.2 Worker render job (`render:design`)
Input: `{ templateVersionId, variantId, values, format: 'png'|'jpg'|'pdf', quality: 'standard'|'hd', businessId, userId }`.
1. Validate `values` against `buildValuesSchema(fields)`; check plan permissions (format, quality, variant).
2. `buildRenderHtml` → open a pooled context with `viewport = canvas size`, `deviceScaleFactor = quality === 'hd' ? 2 : 1`.
3. `await document.fonts.ready`, wait for all images, run auto-fit, then screenshot `#canvas` (PNG) / convert via `sharp` (JPG q=90) / `page.pdf` (PDF).
4. Upload to `renders/{designId}.{ext}`, also write a 512px `thumb.webp`.
5. **Cache**: hash `(templateVersionId, variantId, normalized values, format, quality)`; if a render with that hash exists, return it without rendering.
6. Target: **< 1.5 s p50** per 1080×1080 standard render on a warm pool. Log duration per job.

**Preview renders**: `POST /app/designs/preview` renders at 0.5 scale JPG and is cached for 10 minutes. The mobile app will use this, so it does not need its own renderer.

### 7.3 Arabic & RTL (required)
- Each text layer has `direction`. The importer sets it: `rtl` if the string contains Arabic script (`/[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/`), else `ltr`. The editor can override it.
- Emit `dir="rtl"` on the element and `unicode-bidi: plaintext` so mixed Arabic + numbers/Latin (phone numbers, prices, Instagram handles) read correctly.
- Map Photoshop justification to `text-align: start|center|end` (not left/right) so alignment follows direction. **Verify against the composite** — Photoshop's Middle-Eastern text engine can store alignment differently; adjust the mapping from real fixtures, not guesses.
- Never use `letter-spacing` on Arabic text (it breaks letter joining); drop PSD tracking for RTL runs.
- Support Arabic-Indic digits as a field option (`digits: 'western' | 'arabic'`) applied at render time.
- Golden tests must include Arabic fixtures: a wedding congratulation, a Friday greeting, an offer with a price.

### 7.4 Fonts
- **Font** entity: family name, weight, style, file (`.ttf/.otf/.woff2`, converted to `woff2` on upload), `aliases: string[]` (PSD postscript names, e.g. `Cairo-Bold`), `scripts: ['arabic','latin']`, license note.
- The importer maps `text.style.font.name` → `fontId` via aliases. Unmapped → **missing font** in the report; the editor shows a "map font" action (pick an existing font or upload one, which adds the alias).
- **A template cannot be published while any used font is unmapped.**
- Seed the library with 3–4 open-licensed Arabic fonts so the demo works out of the box.

### 7.5 Image slots
- `fit: cover` by default; the user's optional crop `{x, y, scale}` is applied with `object-position` + `transform: scale()`, inside an overflow-hidden wrapper.
- Masks: `alpha` → CSS `mask-image` with the mask PNG (`mask-size: 100% 100%`); `path` → inline SVG `clipPath`; `shape` → `border-radius`/`clip-path: circle()`.
- Foreground layers above the slot (frames, overlays) are just layers above it in paint order.
- Upload processing (API, before the value is accepted): auto-orient with EXIF, strip metadata, downscale to max 2× the slot size, convert to WebP/PNG, reject below `constraints.image.minWidth/minHeight`.

### 7.6 Text fitting
`TextFit = { mode: 'none' | 'shrink' | 'wrap-shrink', minFontSize: number, maxLines?: number }`.
The auto-fit script runs in the page before the screenshot (and in the preview iframe): for each text layer with `mode !== 'none'`, binary-search the font size between `minFontSize` and the designed size until `scrollHeight <= height` and `scrollWidth <= width`. Default for imported editable text fields: `shrink` with `minFontSize = 60%` of the designed size. If text still doesn't fit at the minimum, the API returns a validation warning `TEXT_OVERFLOW` (with the field key) in the preview response, so the form can tell the user to shorten it.

---

## 8. Template variants (sizes)

A **Template** has one or more **variants**, one per output size, e.g. `square 1080×1080`, `portrait 1080×1350`, `story 1080×1920`, `landscape 1200×628`. Each variant has its own `TemplateDocument` (layers differ), but **all variants share the same field keys** — the user fills the form once and can export any size their plan allows.
- Create a variant by importing another PSD or by **"Duplicate as new size"** (copies the document; the editor offers a "scale & re-center" helper, then the admin fixes the layout by hand).
- On publish, check that every variant defines every field key; otherwise block with a clear list.
- Plans gate variants: Basic → the template's primary variant only; Business → primary + 1; Pro → all (configurable in the plan's feature flags, §10).

---

## 9. Data model (Prisma, summary)

Use UUID primary keys, `createdAt/updatedAt` everywhere, soft delete (`deletedAt`) on business-facing entities.

```
AdminUser        id, email, passwordHash, name, role: SUPER_ADMIN | TEMPLATE_EDITOR | SUPPORT, isActive
Business         id, name, slug, activityType, city, country, status, planId → Plan, notes
BusinessUser     id, businessId, email|phone, passwordHash, name, role: OWNER | MEMBER   (app users)
BrandKit         businessId (1:1), logoAssetId, logoLightAssetId, colors {primary, secondary, accent},
                 fontIds[], phone, website, social {instagram, x, snapchat, tiktok}, address
BusinessAiProfile businessId (1:1), activityDescription, writingTone, audience, market, visualStyle,
                 forbidden (text), customInstructions   ← the "AI instructions per user" from the spec
Plan             id, code: BASIC | BUSINESS | PRO, name {ar,en}, monthlyAiCredits,
                 features (JSON, typed in packages/shared): {maxVariants, hdExport, pdfExport,
                 aiRewrite, bgRemoval, imageEnhance, multipleOptions, templateTiers[]}
Subscription     id, businessId, planId, status, startsAt, endsAt, source: MANUAL   (no payments yet)
Category         id, parentId?, slug, name {ar,en}, icon, sortOrder, isActive
                 seed: تهاني (زواج، خطوبة، مولود، تخرج) · مناسبات (الجمعة، رمضان، الأعياد، اليوم الوطني) ·
                 منتجات وعروض (منتج جديد، خصم، عرض خاص، عرض سعر) · إعلانات تشغيلية (افتتاح، دوام، إجازة، فرع جديد)
Template         id, title {ar,en}, slug, categoryId, tags[], status: DRAFT | PUBLISHED | ARCHIVED,
                 visibility: PUBLIC | PRIVATE, minPlan: BASIC|BUSINESS|PRO, activityTypes[] (targeting),
                 currentVersionId?, draftData (JSON: variants + documents being edited),
                 duplicatedFromId?, createdBy
TemplateAccess   templateId, businessId     (for PRIVATE templates; also allow explicit grants)
TemplateVersion  id, templateId, version (int), variants (JSON: [{id, name, width, height, document}]),
                 fieldsHash, publishedAt, publishedBy        ← immutable after insert
Font             id, family, weight, style, assetId, aliases[], scripts[], license
Asset            id, key (storage), mime, bytes, width?, height?, sha256, kind: PSD|LAYER|COMPOSITE|
                 UPLOAD|RENDER|THUMB|FONT|BRAND, ownerType, ownerId
ImportJob        id, templateId?, sourceAssetId, status, report (JSON), qaScore, qaDiffAssetId, error
Design           id, businessId, userId?, templateVersionId, variantId, values (JSON), renderHash,
                 format, quality, outputAssetId, thumbAssetId, status, durationMs, error
AiCreditLedger   id, businessId, delta (+grant / −spend), reason: MONTHLY_GRANT|SPEND|ADMIN_ADJUST|REFUND,
                 refType, refId, balanceAfter                 ← append-only; balance = SUM(delta)
AiRequest        id, businessId, templateVersionId?, fieldKey?, action, input, output, credits,
                 provider, model, tokensIn, tokensOut, status
AuditLog         id, actorType, actorId, action, entityType, entityId, diff (JSON)
```

Visibility rule (one function, unit-tested, used by every listing endpoint):
`canSee(business, template) = template.status = PUBLISHED AND (
   (template.visibility = PUBLIC AND planRank(business.plan) >= planRank(template.minPlan)
      AND (template.activityTypes is empty OR business.activityType in template.activityTypes))
   OR exists TemplateAccess(template, business))`

Credits: spending inserts a negative ledger row inside a transaction with `SELECT … FOR UPDATE` on the business row; never go below zero; refund on provider failure.

---

## 10. API (REST, `/api/v1`)

Conventions: JSON, Zod-validated request/response, OpenAPI at `/api/v1/docs`, errors as `{ error: { code, message, details? } }` with stable codes from `packages/shared` (`VALIDATION_ERROR`, `TEXT_OVERFLOW`, `PLAN_FEATURE_LOCKED`, `INSUFFICIENT_CREDITS`, `FONT_UNMAPPED`, …). Cursor pagination `?cursor=&limit=`. Messages localized from `Accept-Language` (ar default).

### 10.1 Admin (`/api/v1/admin/*`, AdminUser JWT, role-checked)
```
POST   /auth/login · /auth/refresh · /auth/logout · GET /auth/me
GET    /dashboard/stats                         counts: templates, businesses, designs today, credits used
CRUD   /categories                              + reorder
CRUD   /fonts                                   upload (presigned) → convert → aliases
POST   /uploads/presign                         {kind, mime, bytes} → {key, url}
POST   /imports                                 {sourceKey, templateId?} → 202 {jobId}
GET    /imports/:id                             status + report + qa
CRUD   /templates                               list filters: status, category, visibility, plan, q
GET    /templates/:id/draft · PUT /templates/:id/draft     (whole draft; optimistic lock via `revision`)
POST   /templates/:id/variants                  {fromImportId | duplicateOf: variantId, name, width, height}
POST   /templates/:id/validate                  publish checks → list of problems
POST   /templates/:id/publish                   creates TemplateVersion
POST   /templates/:id/duplicate                 → new DRAFT template (copy assets by reference)
GET    /templates/:id/versions
PUT    /templates/:id/access                    {businessIds[]}
POST   /templates/:id/test-render               {variantId, values} → 202 {jobId}   (uses draft)
CRUD   /businesses                              + /businesses/:id/brand-kit, /ai-profile, /users
PUT    /businesses/:id/subscription             manual plan assignment
POST   /businesses/:id/credits                  {delta, reason} admin adjust
CRUD   /plans                                   (features JSON validated by shared schema)
GET    /designs                                 global log, filters
GET    /ai/requests                             usage log
GET    /jobs/:id
```

### 10.2 App (`/api/v1/app/*`, BusinessUser JWT — used by the simulator now, mobile later)
```
POST   /auth/login · /auth/refresh · GET /me    (me includes business, plan, features, credit balance)
GET    /categories                              only categories with visible templates
GET    /templates?categoryId=&q=                visible templates only (canSee)
GET    /templates/:id                           current version: fields (form), variants (sizes+allowed),
                                                thumbnail; brand-prefilled default values
POST   /uploads/presign                         user photos (kind=UPLOAD)
POST   /designs/preview                         {templateId, variantId, values} → {imageUrl, warnings[]}
POST   /designs                                 {templateId, variantId, values, format, quality} → 202 {designId}
GET    /designs/:id                             status + download URL (presigned, 1 h)
GET    /designs                                 my history
POST   /ai/rewrite                              {templateId, fieldKey, currentText, instruction?} → {options[], creditsLeft}
GET    /brand-kit · PUT /brand-kit             (OWNER only)
```

---

## 11. Admin website (demo pages)

Arabic RTL by default with an English toggle; use logical CSS properties (`ms-`, `me-`, `start`, `end`) everywhere so both directions work. The navigation follows the admin list in the spec; build the **bold** ones now and show the rest as disabled "قريباً" (coming soon) items:

**الرئيسية (Dashboard)** · **القوالب (Templates)** · **تصنيفات القوالب (Categories)** · **الخطوط (Fonts)** · **المستخدمون / الأنشطة (Businesses)** · **الهويات البصرية (Brand kits — inside business)** · **تعليمات AI (per template — inside editor; per business — inside business)** · **الباقات (Plans)** · **الاشتراكات (Subscriptions — manual)** · **رصيد AI (Credits)** · **محاكي العميل (Customer simulator)** · مساعد التطبيق · مساعد التسويق · قاعدة المعرفة · المدفوعات · الإشعارات · التقارير · الأمان · إعدادات النظام.

### 11.1 Template editor (the most important screen)
Three panes:
- **Start pane — Layers**: tree from the document (port the POC layer utils), with type icons, visibility toggle, lock state, and badges: `field`, `raster`, `missing font`. Clicking selects on the canvas.
- **Center — Canvas**: iframe rendering `buildRenderHtml(draft, testValues, {mode:'preview'})`, zoom/fit, rulers, selection overlay (port `CanvasPreview`, `CanvasSelectionOverlay`, `Rulers`). Variant tabs above the canvas (Square / Story / …). Toggle "show original composite" for side-by-side comparison with the PSD.
- **End pane — Inspector** with tabs:
  - *Layer*: position/size (numeric), direction, fit mode, font mapping, text box mode.
  - *Field*: "Make this a field" → key, Arabic/English label, type, required, default, constraints, `source` (brand binding), AI allowance. Shows other layers bound to the same field.
  - *Form preview & test*: the generated form (what the mobile user will see), fillable with sample values; live canvas update; "Test render" button that runs the real worker job and shows the PNG with duration.
  - *Template settings*: title ar/en, category, tags, minPlan, visibility & private businesses, activity targeting, AI policy + instructions text, allowed export sizes.
- Top bar: draft autosave indicator, **Validate**, **Publish**, **Duplicate**, version history, import report & QA score.

Manual-composition mode uses the same editor with an "Add layer" menu: background, foreground, mask, image slot, text box. Drag/resize on the canvas only for these manually-added layers; imported layers are positioned by numbers (keeps the identity locked).

### 11.2 Customer simulator
Choose a business → a phone-width frame that mimics the mobile flow: category grid → template list (thumbnails) → form (auto-generated from fields, prefilled from brand kit, with the AI "rewrite" button on allowed fields showing the credit cost) → size & quality picker (locked options show the plan needed) → preview → render → download. It must call **only `/api/v1/app/*`** with a business-user token (the admin uses "impersonate" → `POST /admin/businesses/:id/impersonate` returns a short-lived app token, logged in AuditLog). This proves the API is mobile-ready.

---

## 12. AI (minimal for the demo)

- `packages/shared/ai` defines `AiProvider { rewriteText(input): Promise<string[]> ; removeBackground?(img) ; enhanceImage?(img) }`. Implement `rewriteText` with the Anthropic SDK (`ANTHROPIC_API_KEY`, `AI_MODEL` env). Leave the image methods as `NotImplemented` behind feature flags.
- **Prompt assembly** (one function, unit-tested, logged in `AiRequest.input`):
  1. system: app-level rules (Arabic marketing copy, Saudi/Gulf market, short social-media text, never invent prices/dates/phone numbers, return JSON `{options: string[]}`),
  2. business AI profile (activity, tone, audience, market, forbidden words, custom instructions),
  3. template AI instructions (`rules.aiPolicy.instructions`) + field label + `maxLength`/`maxLines`,
  4. user's current text + optional instruction ("أكثر رسمية", "أقصر").
- Returns 3 options (Pro may get more via plan flag); each must pass the field's `maxLength`; otherwise retry once, then truncate-filter.
- Costs: `rewrite = 1 credit`. Check the plan feature + field `ai.rewrite` + template `aiPolicy.level`; spend credits through the ledger; refund on failure.
- Monthly grant: a BullMQ repeatable job inserts `MONTHLY_GRANT` rows per active subscription (demo: also a manual "grant now" button).

---

## 13. Non-functional requirements

- **Security**: RBAC on every admin route; tenant isolation on every app route (all queries scoped by `businessId` from the token — write a Fastify hook and a test that tries cross-tenant access); presigned URLs only, private bucket; validate uploads by magic bytes, not extension; PSD parsing only in the worker, with a timeout (60 s) and memory limit; rate limit auth and AI endpoints; never log tokens or passwords.
- **Sanitization**: text values are escaped (POC `escapeHtml`); SVG uploads sanitized (DOMPurify server-side) before use; the render page runs with JavaScript limited to our auto-fit script and **network blocked except `assets.local` route**.
- **Observability**: pino logs with request id and job id; job durations; `/health` and `/ready` on API and worker.
- **i18n**: all UI strings in `ar.json`/`en.json`; DB display names stored as `{ar, en}`.
- **Config**: everything via env, documented in `.env.example`; `pnpm dev` runs docker-compose + api + worker + admin.
- **Seed**: `pnpm db:seed` creates admin `admin@sammly.local`, three plans, the category tree (§9), 3 demo businesses (a restaurant, a perfume shop, a clinic) with brand kits and AI profiles, the open Arabic fonts, and imports every PSD in `fixtures/psd/` as published templates.

### 13.1 Testing
- `template-schema`: schema round-trips, `buildValuesSchema`, migrations.
- `renderer-html`: **golden-image tests** — render fixtures with fixed values in Playwright and pixel-diff against committed PNGs (threshold 0.5%); include Arabic, mixed-direction, auto-fit overflow, masked image slot, multi-variant.
- `importer-psd`: per-fixture snapshot of the document + report; QA score ≥ threshold.
- API: integration tests against a test DB (Testcontainers or the compose services): visibility, plan gating, credits concurrency (10 parallel spends never overdraw), tenant isolation.
- Admin E2E (Playwright): login → import PSD → tag 2 fields → publish → simulator renders → download.

---

## 14. Working conventions for Claude Code

- TypeScript strict, ESM, no `any` without a comment. Zod is the source for types (`z.infer`).
- Keep `renderer-html` and `template-schema` free of Node-only or browser-only APIs (they run in both).
- Small, reviewable commits per feature; conventional commit messages.
- After each milestone: run all tests, update `docs/DECISIONS.md` and `docs/API.md`, and write a short `docs/milestones/Mx.md` with what was built, what's left, and screenshots of the admin if relevant.
- When a PSD fixture renders wrong, fix the importer/renderer — never special-case a file.
- If a requirement here conflicts with what real PSDs show, trust the PSDs, log the decision, and tell the owner.

---

## 15. Milestones & acceptance criteria

| # | Milestone | Done when |
|---|---|---|
| **M0** | Monorepo & infra | `pnpm i && pnpm dev` starts postgres/redis/minio + empty api/worker/admin; lint, typecheck and test pass in CI (GitHub Actions). |
| **M1** | Schema + renderer | `template-schema` (§5) and `renderer-html` (§7.1, 7.3–7.6) done; POC documents migrate into schema v1; golden tests pass incl. Arabic RTL, fonts embedded, masked image slot, auto-fit. |
| **M2** | Import pipeline + fonts | Upload PSD → job → draft document + assets in MinIO + report + QA score; font library with alias mapping; missing fonts reported; field auto-suggest from layer names; ≥95% match on ≥80% of fixtures. |
| **M3** | Admin: auth, categories, fonts, template editor | Admin can log in, manage categories/fonts, import a PSD, tag fields, set constraints, test-fill live, validate, publish a version, duplicate a template, add a size variant, and use manual composition (bg/fg/mask). |
| **M4** | Render service | `/app/designs` + preview with queue/worker, PNG/JPG/PDF, standard/HD, caching by hash, thumbs; p50 < 1.5 s for 1080² warm; design history. |
| **M5** | Businesses, plans, visibility, simulator | Businesses with brand kit + AI profile, manual subscriptions, `canSee` enforced everywhere, plan gating for sizes/quality/format, brand auto-fill, customer simulator running end-to-end on `/app/*` via impersonation. |
| **M6** | AI rewrite + credits | Ledger, monthly grant, `/app/ai/rewrite` with the full prompt assembly, plan/field/template gating, usage log in admin, concurrency test green. |
| **M7** | Demo hardening | Seed with 20–30 real templates (the Phase 2 gate in the project plan), E2E test green, `docs/DEMO.md` with a 5-minute demo script, known-issues list. |

---

## 16. Open decisions (ask the owner; meanwhile use the default)

1. **Hijri dates** — which calendar library / which display format? *Default:* `Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura')`, both calendars available per field.
2. **Admin-side "AI per template" cost control** — the spec says template AI instructions only "if not costly". *Default:* stored as text and appended to the prompt; no extra AI calls.
3. **Photoshop plugin vs web tagging** (open question in the technical study). *Default:* web tagging + the `@field` layer-naming convention so designers can tag inside Photoshop with no plugin.
4. **Self-hosted vs API background removal** for the Business plan (post-demo). *Default:* interface only.
5. **Hosting** — VPS+Docker vs managed (Fargate/ECS) per the project plan's Phase 1 gate. *Default:* Docker images for api/worker/admin that run on either.
6. **Font licensing** for commercial Arabic fonts used in client PSDs — needs a policy before onboarding real templates.
