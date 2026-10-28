# Decision log

Newest first. Each entry: date · decision · why · how to revisit.

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
