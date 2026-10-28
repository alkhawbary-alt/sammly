import path from 'node:path';
import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.string().default('development'),
  DATABASE_URL: z.string().min(1),
  QUEUE_DRIVER: z.enum(['pg', 'bullmq']).default('pg'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('.data/storage'),
  /** HMAC key for local-driver signed URLs. */
  STORAGE_SIGNING_KEY: z.string().default('dev-storage-signing-key'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().default('sammly'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  /** Public base URL of the API (signed local storage URLs point here). */
  API_PUBLIC_URL: z.string().default('http://localhost:4000'),
  API_PORT: z.coerce.number().default(4000),
  WORKER_HEALTH_PORT: z.coerce.number().default(4001),
  RENDER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  IMPORT_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  IMPORT_MAX_MEMORY_MB: z.coerce.number().int().positive().default(4096),
  JWT_ACCESS_SECRET: z.string().default('change-me-access'),
  JWT_REFRESH_SECRET: z.string().default('change-me-refresh'),
  LOG_LEVEL: z.string().default('info'),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('claude-sonnet-5-5'),
});
export type AppConfig = z.infer<typeof Env> & { repoRoot: string };

let cached: AppConfig | undefined;

/** Repo root: two levels above packages/platform. */
export const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

export function config(): AppConfig {
  if (!cached) {
    const parsed = Env.parse(process.env);
    cached = {
      ...parsed,
      STORAGE_LOCAL_DIR: path.resolve(REPO_ROOT, parsed.STORAGE_LOCAL_DIR),
      repoRoot: REPO_ROOT,
    };
  }
  return cached;
}
