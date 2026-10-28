# Sammly (صمملي)

Template-based social-media design platform. This repo holds the core services and the admin website (demo phase). See `SAMMLY-ADMIN-DEMO-BRIEF.md` for the full brief and `docs/` for decisions and milestone notes.

## Run it

```bash
pnpm install
cp .env.example .env      # Windows: copy .env.example .env
pnpm dev                  # embedded Postgres + api :4000 + worker :4001 + admin :3000
```

No Docker needed (`INFRA_MODE=embedded`). To use Postgres/Redis/MinIO containers instead, set `INFRA_MODE=docker` in `.env`.

```bash
pnpm check                # lint + typecheck + tests (incl. Chromium golden renders)
```

First time only, install the browser used by the renderer tests:

```bash
pnpm --filter @sammly/renderer-html exec playwright install chromium
```

## Layout

| Path | What |
|---|---|
| `apps/api` | Fastify REST API (`/api/v1`) |
| `apps/worker` | Background jobs: import, render, ai |
| `apps/admin` | Next.js admin (Arabic RTL, EN toggle) |
| `packages/template-schema` | Template Document schema, values validation, publish checks, migrations |
| `packages/renderer-html` | Template + values → HTML (pure); `/qa`: headless render + pixel diff |
| `packages/importer-psd` | PSD → Template Document (M2) |
| `packages/shared` | Error codes, plans, constants |
| `fixtures/` | Test fonts (OFL) and real PSD templates (`fixtures/psd/`) |
| `POC/` | Original proof of concept (reference only) |
