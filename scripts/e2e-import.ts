/**
 * Smoke test of the import pipeline through the running API + worker:
 *   presign → PUT file → POST /admin/imports → poll job → GET /admin/imports/:id
 * Usage: pnpm tsx scripts/e2e-import.ts "fixtures/psd/<file>.psd"
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const API = process.env.API_PUBLIC_URL ?? 'http://localhost:4000';
const file = process.argv[2];
if (!file) throw new Error('usage: e2e-import <psd path>');

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}/api/v1${url}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${JSON.stringify(json)}`);
  return json as T;
}

const started = Date.now();
const bytes = await fs.readFile(file);
const fileName = path.basename(file);

const put = await call<{ key: string; url: string; headers: Record<string, string> }>('POST', '/admin/uploads/presign', { kind: 'psd', mime: 'image/vnd.adobe.photoshop', bytes: bytes.length, fileName });
const up = await fetch(put.url, { method: 'PUT', headers: put.headers, body: bytes });
if (!up.ok) throw new Error(`upload failed ${up.status} ${await up.text()}`);
console.log(`uploaded ${(bytes.length / 1024 / 1024).toFixed(1)} MB → ${put.key}`);

const { importId, jobId } = await call<{ importId: string; jobId: string }>('POST', '/admin/imports', { sourceKey: put.key, fileName });
console.log(`import ${importId} (job ${jobId}) queued`);

let job: { status: string; error?: string; durationMs?: number };
do {
  await new Promise((r) => setTimeout(r, 1000));
  job = await call('GET', `/admin/jobs/${jobId}`);
} while (job.status === 'QUEUED' || job.status === 'RUNNING');
console.log(`job ${job.status} in ${job.durationMs}ms ${job.error ?? ''}`);

const imp = await call<{
  status: string;
  qa: { score: number; warning: boolean; diffUrl: string; renderUrl: string } | null;
  report: { counts: object; missingFonts: { psdName: string }[]; suggestedFields: { key: string }[]; warnings: string[] };
  document: { layers: unknown[] };
  assets: Record<string, string>;
}>('GET', `/admin/imports/${importId}`);
console.log(JSON.stringify({
  status: imp.status,
  qa: imp.qa && { score: imp.qa.score, warning: imp.qa.warning },
  counts: imp.report?.counts,
  missingFonts: imp.report?.missingFonts.map((m) => m.psdName),
  suggested: imp.report?.suggestedFields.map((s) => s.key),
  layers: imp.document?.layers.length,
  assetUrls: Object.keys(imp.assets ?? {}).length,
}, null, 2));

// Signed asset URLs must actually serve the files.
const firstUrl = Object.values(imp.assets)[0];
if (firstUrl) {
  const r = await fetch(firstUrl);
  console.log(`asset GET ${r.status} ${r.headers.get('content-type')} ${(await r.arrayBuffer()).byteLength} bytes`);
}
console.log(`total ${Date.now() - started}ms`);
