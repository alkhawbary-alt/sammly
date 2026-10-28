/**
 * Starts local infrastructure for `pnpm dev`.
 *
 *  INFRA_MODE=embedded (default): an embedded PostgreSQL under .data/pg and the
 *    local storage directory. No Docker, no Redis (queues run on Postgres).
 *  INFRA_MODE=docker: `docker compose up` (postgres, redis, minio + bucket init).
 *
 * The process stays in the foreground until Ctrl+C, then shuts the services down.
 */
import 'dotenv/config';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const mode = process.env.INFRA_MODE ?? 'embedded';

async function runDocker(): Promise<void> {
  const child = spawn('docker', ['compose', 'up'], { cwd: root, stdio: 'inherit', shell: true });
  child.on('exit', (code) => process.exit(code ?? 0));
}

async function runEmbedded(): Promise<void> {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const url = new URL(process.env.DATABASE_URL ?? 'postgresql://sammly:sammly@localhost:5433/sammly');
  const port = Number(process.env.EMBEDDED_PG_PORT ?? url.port ?? 5433);
  const dbName = url.pathname.replace(/^\//, '') || 'sammly';
  const dataDir = path.join(root, '.data', 'pg');
  const storageDir = path.resolve(root, process.env.STORAGE_LOCAL_DIR ?? '.data/storage');

  await fs.mkdir(storageDir, { recursive: true });

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: decodeURIComponent(url.username || 'sammly'),
    password: decodeURIComponent(url.password || 'sammly'),
    port,
    persistent: true,
    onLog: () => {},
  });

  const initialised = await fs
    .stat(path.join(dataDir, 'PG_VERSION'))
    .then(() => true)
    .catch(() => false);
  if (!initialised) {
    console.log('[infra] initialising embedded PostgreSQL in .data/pg …');
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase(dbName);
  } catch {
    // already exists
  }
  console.log(`[infra] PostgreSQL ready on :${port} (db "${dbName}")`);
  console.log(`[infra] local storage at ${path.relative(root, storageDir)}`);

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    console.log('[infra] stopping PostgreSQL …');
    await pg.stop().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  // keep alive
  setInterval(() => {}, 1 << 30);
}

if (mode === 'docker') await runDocker();
else await runEmbedded();
