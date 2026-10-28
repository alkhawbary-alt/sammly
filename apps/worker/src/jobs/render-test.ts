import { db, type Job } from '@sammly/db';
import { saveAsset } from '@sammly/platform';
import { TemplateDraft, type FieldValues } from '@sammly/template-schema';
import { renderDocument } from '../render';

interface Payload {
  templateId: string;
  variantId: string;
  values: FieldValues;
  quality: 'standard' | 'hd';
}

/** Admin "Test render": renders the current draft with sample values through the export path. */
export async function renderTestJob(job: Job) {
  const p = job.payload as unknown as Payload;
  const t = await db().template.findUniqueOrThrow({ where: { id: p.templateId } });
  const variant = TemplateDraft.parse(t.draftData).variants.find((v) => v.id === p.variantId);
  if (!variant) throw new Error(`Variant ${p.variantId} not found`);
  const r = await renderDocument(variant.document, p.values, { deviceScaleFactor: p.quality === 'hd' ? 2 : 1 });
  const asset = await saveAsset({ body: r.png, mime: 'image/png', kind: 'RENDER', ownerType: 'Template', ownerId: t.id });
  return { assetId: asset.id, durationMs: r.durationMs, overflow: r.overflow };
}
