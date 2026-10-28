import crypto from 'node:crypto';
import { db, type Font } from '@sammly/db';
import { saveAsset, sniffMime } from './assets';

export interface CreateFontInput {
  body: Buffer;
  family: string;
  weight: number;
  style?: 'normal' | 'italic';
  aliases?: string[];
  scripts?: string[];
  license?: string;
}

async function toWoff2(body: Buffer): Promise<Buffer> {
  const mime = sniffMime(body);
  if (mime === 'font/woff2') return body;
  if (mime !== 'font/ttf' && mime !== 'font/otf') throw new Error(`Not a font file (${mime ?? 'unknown'})`);
  // wawoff2 ships no types; import via a variable so consumers don't need a shim.
  const mod = 'wawoff2';
  const { default: wawoff2 } = (await import(mod)) as { default: { compress: (b: Uint8Array) => Promise<Uint8Array> } };
  return Buffer.from(await wawoff2.compress(body));
}

const normAlias = (a: string) => a.trim();

/** Convert to WOFF2 (identical files — e.g. one variable font at several weights — share one asset). */
export async function createFont(input: CreateFontInput): Promise<Font> {
  const woff2 = await toWoff2(input.body);
  const sha = crypto.createHash('sha256').update(woff2).digest('hex');
  const existing = await db().asset.findFirst({ where: { sha256: sha, kind: 'FONT' } });
  const asset = existing ?? (await saveAsset({ body: woff2, mime: 'font/woff2', kind: 'FONT' }));
  return db().font.create({
    data: {
      family: input.family,
      weight: input.weight,
      style: input.style ?? 'normal',
      assetId: asset.id,
      aliases: [...new Set((input.aliases ?? []).map(normAlias).filter(Boolean))],
      scripts: input.scripts ?? [],
      license: input.license,
    },
  });
}

/** lower-cased PostScript alias → font id, for the importer's `fontIdFor`. */
export async function fontAliasMap(): Promise<Map<string, string>> {
  const fonts = await db().font.findMany({ where: { deletedAt: null }, select: { id: true, aliases: true } });
  const map = new Map<string, string>();
  for (const f of fonts) for (const a of f.aliases) map.set(a.toLowerCase(), f.id);
  return map;
}

export async function addFontAlias(fontId: string, alias: string): Promise<Font> {
  const f = await db().font.findUniqueOrThrow({ where: { id: fontId } });
  return db().font.update({ where: { id: fontId }, data: { aliases: [...new Set([...f.aliases, normAlias(alias)])] } });
}
