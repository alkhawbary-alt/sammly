import crypto from 'node:crypto';
import { db, type Template } from '@sammly/db';
import { assetUrl } from '@sammly/platform';
import { TemplateDraft, usedFontIds, validateVariants, walkLayers, type Problem, type TemplateDocument } from '@sammly/template-schema';

export function readDraft(t: Pick<Template, 'draftData'>): TemplateDraft {
  return TemplateDraft.parse(t.draftData);
}

export function assetIdsOf(doc: TemplateDocument): string[] {
  const ids = new Set<string>();
  for (const l of walkLayers(doc.layers)) {
    if ('assetId' in l && l.assetId) ids.add(l.assetId);
    if (l.type === 'imageSlot') {
      if (l.placeholderAssetId) ids.add(l.placeholderAssetId);
      if (l.mask?.kind === 'alpha') ids.add(l.mask.assetId);
    }
  }
  if (doc.meta.compositeAssetId) ids.add(doc.meta.compositeAssetId);
  return [...ids];
}

/** Signed URLs for every asset referenced by the draft (editor preview). */
export async function assetUrlMap(draft: TemplateDraft): Promise<Record<string, string>> {
  const ids = new Set(draft.variants.flatMap((v) => assetIdsOf(v.document)));
  const out: Record<string, string> = {};
  await Promise.all(
    [...ids].map(async (id) => {
      const url = await assetUrl(id);
      if (url) out[id] = url;
    }),
  );
  return out;
}

export interface FontInfo {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  url: string;
}

export async function fontMap(fontIds: string[]): Promise<Record<string, FontInfo>> {
  const fonts = await db().font.findMany({ where: { id: { in: fontIds.filter((id) => /^[0-9a-f-]{36}$/.test(id)) }, deletedAt: null } });
  const out: Record<string, FontInfo> = {};
  for (const f of fonts) {
    const url = await assetUrl(f.assetId);
    if (url) out[f.id] = { family: f.family, weight: f.weight, style: f.style === 'italic' ? 'italic' : 'normal', url };
  }
  return out;
}

export function draftFontIds(draft: TemplateDraft): string[] {
  return [...new Set(draft.variants.flatMap((v) => usedFontIds(v.document.layers)))];
}

export interface PublishProblem extends Problem {
  variantId?: string;
}

/** Everything that blocks publishing: structure, fields across variants, fonts, metadata. */
export async function publishProblems(t: Template, draft: TemplateDraft): Promise<{ code: string; message: string; path?: string }[]> {
  const problems: { code: string; message: string; path?: string }[] = [...validateVariants(draft.variants)];
  const fontIds = draftFontIds(draft);
  const known = new Set((await db().font.findMany({ where: { id: { in: fontIds.filter((id) => /^[0-9a-f-]{36}$/.test(id)) }, deletedAt: null }, select: { id: true } })).map((f) => f.id));
  for (const id of fontIds) if (!known.has(id)) problems.push({ code: 'FONT_UNMAPPED', message: `Font ${id} is not in the font library` });
  const title = t.title as { ar?: string };
  if (!title?.ar?.trim()) problems.push({ code: 'TITLE_MISSING', message: 'Arabic title is required' });
  if (!t.categoryId) problems.push({ code: 'CATEGORY_MISSING', message: 'Pick a category' });
  if (draft.variants[0]!.document.fields.length === 0) problems.push({ code: 'NO_FIELDS', message: 'Add at least one field (otherwise there is nothing to fill in)' });
  const variantIds = new Set(draft.variants.map((v) => v.id));
  for (const v of draft.variants) {
    for (const s of v.document.rules.exportSizes) {
      if (!variantIds.has(s)) problems.push({ code: 'EXPORT_SIZE_UNKNOWN', message: `Export size "${s}" is not a variant`, path: `variants.${v.id}.rules.exportSizes` });
    }
  }
  return problems;
}

export function fieldsHash(draft: TemplateDraft): string {
  const sig = draft.variants[0]!.document.fields.map((f) => `${f.key}:${f.type}`).sort().join('|');
  return crypto.createHash('sha256').update(sig).digest('hex').slice(0, 16);
}
