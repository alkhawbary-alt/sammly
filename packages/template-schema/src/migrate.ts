import { detectDirection } from './common';
import { SCHEMA_VERSION, TemplateDocument, type TemplateDocumentInput } from './document';
import type { LayerInput } from './layers';

export class UnsupportedSchemaVersionError extends Error {
  constructor(public readonly version: unknown) {
    super(`Unsupported template schemaVersion: ${String(version)}`);
  }
}

type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

/**
 * Upgrade steps keyed by the version they upgrade FROM. Add `1: (d) => ({ ...d, schemaVersion: 2 })`
 * when v2 lands. Published versions are stored as-is and migrated on read, so they always render.
 */
const MIGRATIONS: Record<number, Migration> = {};

/** Parse any stored document version into the current schema (throws on invalid data). */
export function migrate(input: unknown): TemplateDocument {
  if (typeof input !== 'object' || input === null) throw new UnsupportedSchemaVersionError(undefined);
  let doc = input as Record<string, unknown>;
  const declared = doc.schemaVersion;
  if (typeof declared !== 'number' || declared < 1 || declared > SCHEMA_VERSION) {
    throw new UnsupportedSchemaVersionError(declared);
  }
  let version: number = declared;
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new UnsupportedSchemaVersionError(version);
    doc = step(doc);
    version = doc.schemaVersion as number;
  }
  return TemplateDocument.parse(doc);
}

// ─── POC → v1 ──────────────────────────────────────────────────────────

/** Shape of POC `DesignDocument` (POC/src/types/design.ts), kept loose on purpose. */
export interface PocLayer {
  id: string;
  name: string;
  type: 'text' | 'image' | 'raster' | 'shape' | 'svg' | 'group';
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;
  rotation?: number;
  visible?: boolean;
  blendMode?: string;
  text?: string;
  style?: {
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: string | number;
    fontStyle?: 'normal' | 'italic';
    color?: string;
    textAlign?: 'left' | 'center' | 'right' | 'justify';
    lineHeight?: number | string;
    letterSpacing?: number;
    textDecoration?: string;
  };
  src?: string;
  fit?: 'contain' | 'cover' | 'fill' | 'none';
  shapeType?: 'rectangle' | 'ellipse' | 'circle' | 'line';
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  borderRadius?: number | string;
  svgContent?: string;
  children?: PocLayer[];
}

export interface PocDesignDocument {
  name?: string;
  width: number;
  height: number;
  backgroundColor?: string;
  layers: PocLayer[];
  meta?: { sourceFormat?: string; originalFileName?: string; compositeUrl?: string };
}

export interface FromPocOptions {
  /** Map a POC asset URL/path to an asset id (the caller uploads the file). */
  srcToAssetId: (src: string) => string;
  /** Map a PSD font name to a font-library id, if known. */
  fontIdFor?: (fontFamily: string) => string | undefined;
}

const BLENDS = new Set([
  'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light',
  'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity',
]);

function weight(w: string | number | undefined): number {
  if (typeof w === 'number') return Math.min(900, Math.max(100, Math.round(w / 100) * 100));
  if (w === 'bold') return 700;
  const n = Number(w);
  return Number.isFinite(n) && n > 0 ? weight(n) : 400;
}

function align(a: string | undefined, dir: 'rtl' | 'ltr'): 'start' | 'center' | 'end' | 'justify' {
  if (a === 'center' || a === 'justify') return a;
  if (a === 'right') return dir === 'rtl' ? 'start' : 'end';
  if (a === 'left') return dir === 'rtl' ? 'end' : 'start';
  return 'start';
}

function convertLayer(l: PocLayer, opts: FromPocOptions): LayerInput | null {
  const base = {
    id: l.id,
    name: l.name,
    x: l.x,
    y: l.y,
    width: Math.max(0, l.width),
    height: Math.max(0, l.height),
    rotation: l.rotation ?? 0,
    opacity: l.opacity ?? 1,
    visible: l.visible ?? true,
    blendMode: (l.blendMode && BLENDS.has(l.blendMode) ? l.blendMode : 'normal') as 'normal',
  };
  switch (l.type) {
    case 'text': {
      const text = l.text ?? '';
      const dir = detectDirection(text);
      const s = l.style ?? {};
      const fontSize = s.fontSize ?? 16;
      const lh = typeof s.lineHeight === 'number' ? s.lineHeight : undefined;
      const fontFamily = s.fontFamily ?? 'sans-serif';
      return {
        ...base,
        type: 'text',
        text,
        direction: dir,
        textBox: 'box',
        style: {
          fontId: opts.fontIdFor?.(fontFamily),
          fontFamily,
          fontSize,
          fontWeight: weight(s.fontWeight),
          fontStyle: s.fontStyle ?? 'normal',
          color: s.color ?? '#000000',
          align: align(s.textAlign, dir),
          lineHeight: lh,
          letterSpacing: dir === 'rtl' ? undefined : s.letterSpacing,
          textDecoration: s.textDecoration === 'underline' || s.textDecoration === 'line-through' ? s.textDecoration : 'none',
        },
      };
    }
    case 'image':
      return { ...base, type: 'image', assetId: opts.srcToAssetId(l.src ?? ''), fit: l.fit === 'none' ? 'contain' : (l.fit ?? 'contain') };
    case 'raster':
      return { ...base, type: 'raster', assetId: opts.srcToAssetId(l.src ?? '') };
    case 'shape': {
      if (l.shapeType === 'line') return null;
      const radius = typeof l.borderRadius === 'number' ? l.borderRadius : Number.parseFloat(String(l.borderRadius ?? 0)) || 0;
      return {
        ...base,
        type: 'shape',
        shape: l.shapeType === 'ellipse' || l.shapeType === 'circle' ? 'ellipse' : 'rectangle',
        fill: l.fill,
        stroke: l.stroke,
        strokeWidth: l.strokeWidth ?? 0,
        radius,
      };
    }
    case 'svg':
      return l.svgContent
        ? { ...base, type: 'svg', svgContent: l.svgContent }
        : { ...base, type: 'svg', assetId: opts.srcToAssetId(l.src ?? '') };
    case 'group':
      return {
        ...base,
        type: 'group',
        children: (l.children ?? []).map((c) => convertLayer(c, opts)).filter((c): c is LayerInput => c !== null),
      };
  }
}

/** Convert a POC DesignDocument into a v1 Template Document (layers only, no fields). */
export function fromPocDesign(poc: PocDesignDocument, opts: FromPocOptions): TemplateDocument {
  const input: TemplateDocumentInput = {
    schemaVersion: SCHEMA_VERSION,
    canvas: {
      width: Math.round(poc.width),
      height: Math.round(poc.height),
      background: poc.backgroundColor ?? '#ffffff',
    },
    layers: poc.layers.map((l) => convertLayer(l, opts)).filter((l): l is LayerInput => l !== null),
    fields: [],
    meta: {
      source: poc.meta?.sourceFormat === 'psd' ? 'psd' : 'manual',
      sourceFileName: poc.meta?.originalFileName,
      compositeAssetId: poc.meta?.compositeUrl ? opts.srcToAssetId(poc.meta.compositeUrl) : undefined,
    },
  };
  return TemplateDocument.parse(input);
}
