import { db, type Job, type Prisma } from '@sammly/db';

export type JobHandler = (job: Job) => Promise<Prisma.InputJsonValue | void>;

export interface WorkerOptions {
  /** type → { handler, concurrency } */
  handlers: Record<string, { handler: JobHandler; concurrency: number }>;
  pollMs?: number;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

/**
 * Jobs live in the `Job` table (status, payload, result) whatever the driver. In the default
 * `pg` driver the worker claims rows with `FOR UPDATE SKIP LOCKED`, so several worker
 * processes can share the queue safely. (A BullMQ driver would only deliver job ids.)
 */
export async function enqueue(type: string, payload: Prisma.InputJsonValue, opts: { maxAttempts?: number } = {}): Promise<Job> {
  return db().job.create({ data: { type, payload, maxAttempts: opts.maxAttempts ?? 2 } });
}

async function claim(type: string): Promise<Job | null> {
  const rows = await db().$queryRaw<Job[]>`
    UPDATE "Job" SET status = 'RUNNING', "startedAt" = now(), attempts = attempts + 1, "updatedAt" = now()
    WHERE id = (
      SELECT id FROM "Job"
      WHERE status = 'QUEUED' AND "runAfter" <= now() AND type = ${type}
      ORDER BY "createdAt"
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *`;
  return rows[0] ?? null;
}

export interface QueueWorker {
  stop(): Promise<void>;
}

export function startWorker(opts: WorkerOptions): QueueWorker {
  const pollMs = opts.pollMs ?? 300;
  const log = opts.log ?? (() => {});
  let running = true;
  const loops: Promise<void>[] = [];

  // Jobs left RUNNING by a crashed worker go back to the queue.
  void db().job.updateMany({
    where: { status: 'RUNNING', startedAt: { lt: new Date(Date.now() - 10 * 60_000) } },
    data: { status: 'QUEUED' },
  });

  const loop = async (type: string, handler: JobHandler) => {
    while (running) {
      let job: Job | null = null;
      try {
        job = await claim(type);
      } catch (err) {
        log('claim failed', { type, err: String(err) });
      }
      if (!job) {
        await new Promise((r) => setTimeout(r, pollMs));
        continue;
      }
      const started = Date.now();
      try {
        const result = await handler(job);
        await db().job.update({
          where: { id: job.id },
          data: { status: 'SUCCEEDED', result: result ?? undefined, finishedAt: new Date(), durationMs: Date.now() - started, error: null },
        });
        log('job done', { jobId: job.id, type, durationMs: Date.now() - started });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const retry = job.attempts < job.maxAttempts;
        await db().job.update({
          where: { id: job.id },
          data: retry
            ? { status: 'QUEUED', runAfter: new Date(Date.now() + 5_000 * job.attempts), error: message }
            : { status: 'FAILED', error: message, finishedAt: new Date(), durationMs: Date.now() - started },
        });
        log(retry ? 'job failed, will retry' : 'job failed', { jobId: job.id, type, error: message });
      }
    }
  };

  for (const [type, { handler, concurrency }] of Object.entries(opts.handlers)) {
    for (let i = 0; i < concurrency; i++) loops.push(loop(type, handler));
  }
  return {
    async stop() {
      running = false;
      await Promise.all(loops);
    },
  };
}
