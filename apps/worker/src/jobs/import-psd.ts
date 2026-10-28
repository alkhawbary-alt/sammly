import { fork } from 'node:child_process';
import path from 'node:path';
import { db, type Job } from '@sammly/db';
import { assetBody, config, saveAsset } from '@sammly/platform';
import { compareImages } from '@sammly/renderer-html/qa';
import { migrate } from '@sammly/template-schema';
import { renderDocument } from '../render';

export interface ImportPayload {
  importId: string;
}

/** Below this the admin shows a QA warning badge (brief §6.1). */
export const QA_THRESHOLD = 95;

function runChild(importId: string): Promise<void> {
  const c = config();
  return new Promise((resolve, reject) => {
    const child = fork(path.join(import.meta.dirname, 'import-child.ts'), [importId], {
      execArgv: ['--import', 'tsx', `--max-old-space-size=${c.IMPORT_MAX_MEMORY_MB}`],
      stdio: ['ignore', 'inherit', 'pipe', 'ipc'],
    });
    let stderr = '';
    child.stderr?.on('data', (d) => (stderr = (stderr + d).slice(-4000)));
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`PSD import timed out after ${c.IMPORT_TIMEOUT_MS / 1000}s`));
    }, c.IMPORT_TIMEOUT_MS);
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`PSD import failed (${signal ?? `exit ${code}`}): ${stderr.trim().split('\n').slice(-3).join(' ')}`));
    });
  });
}

export async function importPsdJob(job: Job) {
  const { importId } = job.payload as unknown as ImportPayload;
  await db().importJob.update({ where: { id: importId }, data: { status: 'RUNNING', error: null } });
  try {
    await runChild(importId);

    // Visual QA: render the draft with its designed text and diff against Photoshop's composite.
    const imp = await db().importJob.findUniqueOrThrow({ where: { id: importId } });
    const doc = migrate(imp.document);
    let qaScore: number | null = null;
    let qaDiffAssetId: string | null = null;
    let qaRenderAssetId: string | null = null;
    if (doc.meta.compositeAssetId) {
      const render = await renderDocument(doc, {});
      const composite = await assetBody(doc.meta.compositeAssetId);
      const diff = await compareImages(composite!.body, render.png);
      qaScore = diff.matchPercentage;
      const owner = { ownerType: 'ImportJob', ownerId: importId };
      qaRenderAssetId = (await saveAsset({ body: render.png, mime: 'image/png', kind: 'RENDER', width: doc.canvas.width, height: doc.canvas.height, ...owner })).id;
      qaDiffAssetId = (await saveAsset({ body: diff.diffPng, mime: 'image/png', kind: 'QA_DIFF', width: diff.width, height: diff.height, ...owner })).id;
    }
    await db().importJob.update({ where: { id: importId }, data: { status: 'SUCCEEDED', qaScore, qaDiffAssetId, qaRenderAssetId } });
    return { importId, qaScore };
  } catch (err) {
    const willRetry = job.attempts < job.maxAttempts;
    await db().importJob.update({
      where: { id: importId },
      data: { status: willRetry ? 'QUEUED' : 'FAILED', error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}
