/**
 * Runs in a child process (memory-capped, killed on timeout): parse the PSD, upload the
 * extracted assets and store the draft document + report on the ImportJob row.
 */
import crypto from 'node:crypto';
import { db, disconnectDb } from '@sammly/db';
import { importPsd } from '@sammly/importer-psd';
import { fontAliasMap, saveAsset, storage } from '@sammly/platform';

const importId = process.argv[2];
if (!importId) throw new Error('usage: import-child <importId>');

const imp = await db().importJob.findUniqueOrThrow({ where: { id: importId } });
const source = await db().asset.findUniqueOrThrow({ where: { id: imp.sourceAssetId } });
const aliases = await fontAliasMap();

const result = await importPsd(await storage().get(source.key), {
  fileName: imp.fileName,
  fontIdFor: (ps) => aliases.get(ps.toLowerCase()),
  newAssetId: () => crypto.randomUUID(),
});

for (const a of result.assets) {
  await saveAsset({
    id: a.id,
    body: a.body,
    mime: a.mime,
    kind: a.kind,
    width: a.width,
    height: a.height,
    ownerType: 'ImportJob',
    ownerId: importId,
  });
}

await db().importJob.update({
  where: { id: importId },
  data: { document: result.document as object, report: result.report as object },
});
await disconnectDb();
process.exit(0);
