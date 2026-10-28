import { readPsd, type Layer as PsdLayer, type Psd } from 'ag-psd';
import { nanoid } from 'nanoid';
import { SCHEMA_VERSION, TemplateDocument, type LayerInput, type TemplateDocumentInput } from '@sammly/template-schema';
import { applyAdjustment } from './adjust';
import { blendOnto, cssBlend, lerpOnto } from './blend';
import { alphaBounds, copy, crop, ctx, encodePng, ensureAgPsdCanvas, maskedBy, surface, type Surface } from './canvas';
import { layerContent, maskSurface, renderWithEffects, type EffectEnv, type Piece } from './effects';
import { suggestFields, type SuggestedField } from './suggest';
import { convertText } from './text';

export interface ImportedAsset {
  id: string;
  kind: 'LAYER' | 'COMPOSITE';
  name: string;
  mime: 'image/png';
  body: Buffer;
  width: number;
  height: number;
}

export interface LayerReport {
  path: string;
  type: 'text' | 'raster' | 'group' | 'adjustment' | 'merged';
  status: 'editable' | 'rasterized' | 'merged' | 'skipped';
  notes?: string;
}

export interface MissingFont {
  psdName: string;
  layers: string[];
}

export interface ImportReport {
  fileName: string;
  width: number;
  height: number;
  counts: { total: number; editable: number; rasterized: number; merged: number; skipped: number };
  layers: LayerReport[];
  /** Deduplicated notes about features that are approximated or dropped. */
  warnings: string[];
  missingFonts: MissingFont[];
  /** From the `@key` / `field:key` / `zone:key` naming convention — not applied automatically. */
  suggestedFields: SuggestedField[];
  durationMs: number;
}

export interface ImportOptions {
  fileName: string;
  /** PostScript font name → font library id (via aliases). */
  fontIdFor?: (psName: string) => string | undefined;
  /** Id for a new asset. Defaults to nanoid. */
  newAssetId?: () => string;
  /** Stable layer id for a layer path (re-imports keep ids). Defaults to nanoid(10). */
  layerIdFor?: (path: string) => string | undefined;
}

export interface ImportResult {
  document: TemplateDocument;
  assets: ImportedAsset[];
  report: ImportReport;
}

const STOP = Symbol('stop');
const TAG_RE = /^\s*(@|field:|zone:|slot:|\{\{)/i;

interface Env extends EffectEnv {
  psd: Psd;
  baked: Set<PsdLayer>;
  isDynamic: (l: PsdLayer) => boolean;
}

const isGroup = (l: PsdLayer) => Array.isArray(l.children);
const isPassThrough = (l: PsdLayer) => !l.blendMode || l.blendMode === 'pass through';
const hasEffects = (l: PsdLayer) =>
  !!l.effects && !l.effects.disabled && Object.entries(l.effects).some(([k, v]) => k !== 'scale' && k !== 'disabled' && v && (Array.isArray(v) ? v.some((e) => e.enabled !== false) : (v as { enabled?: boolean }).enabled !== false));

function containsDynamic(l: PsdLayer, env: Env): boolean {
  if (l.hidden) return false;
  if (env.isDynamic(l)) return true;
  return (l.children ?? []).some((c) => containsDynamic(c, env));
}

function markBaked(l: PsdLayer, env: Env): void {
  env.baked.add(l);
  for (const c of l.children ?? []) markBaked(c, env);
}

/** Clipping groups: a base layer followed by the layers clipped to it. */
function* clipGroups(layers: PsdLayer[]): Generator<{ base: PsdLayer; clipped: PsdLayer[] }> {
  for (let i = 0; i < layers.length; i++) {
    const base = layers[i]!;
    const clipped: PsdLayer[] = [];
    while (i + 1 < layers.length && layers[i + 1]!.clipping) clipped.push(layers[++i]!);
    yield { base, clipped };
  }
}

/** Layer (or group) pixels with its own mask applied — before effects. */
function contentOf(l: PsdLayer, env: Env): Surface | null {
  let content: Surface | null;
  if (isGroup(l)) {
    content = surface(env.W, env.H);
    compositeList(content, l.children!, env, false);
  } else {
    content = layerContent(l, env);
  }
  if (!content) return null;
  const mask = maskSurface(l.mask, env);
  return mask ? maskedBy(content, mask) : content;
}

/** Apply clipped layers inside the base's body (they only paint where the base has pixels). */
function applyClipped(body: Surface, clipped: PsdLayer[], env: Env): void {
  if (!clipped.length) return;
  const baseAlpha = copy(body);
  for (const c of clipped) {
    if (c.hidden) continue;
    if (c.adjustment) {
      const res = applyAdjustment(body, c.adjustment);
      if (typeof res === 'string') env.warn(res);
      else blendOnto(body, maskedBy(res, baseAlpha), c.blendMode, (c.opacity ?? 1) * (c.fillOpacity ?? 1), maskSurface(c.mask, env));
      continue;
    }
    const content = contentOf(c, env);
    if (!content) continue;
    for (const p of renderWithEffects(c, content, env)) blendOnto(body, maskedBy(p.surface, baseAlpha), p.blend, p.opacity);
  }
}

/** Composite one clip group onto `dst` with full Photoshop semantics. */
function drawNode(dst: Surface, base: PsdLayer, clipped: PsdLayer[], env: Env): void {
  if (base.adjustment) {
    const res = applyAdjustment(dst, base.adjustment);
    if (typeof res === 'string') return env.warn(res);
    blendOnto(dst, res, base.blendMode, (base.opacity ?? 1) * (base.fillOpacity ?? 1), maskSurface(base.mask, env));
    return;
  }
  if (isGroup(base) && isPassThrough(base) && !hasEffects(base) && !clipped.length) {
    const mask = maskSurface(base.mask, env);
    const op = base.opacity ?? 1;
    if (op >= 1 && !mask) return compositeList(dst, base.children!, env, false);
    const before = copy(dst);
    compositeList(dst, base.children!, env, false);
    const mixed = lerpOnto(before, dst, op, mask);
    const c = ctx(dst);
    c.clearRect(0, 0, env.W, env.H);
    c.drawImage(mixed, 0, 0);
    return;
  }
  const content = contentOf(base, env);
  if (!content) return;
  const pieces = renderWithEffects(base, content, env);
  applyClipped(pieces[pieces.length - 1]!.surface, clipped, env);
  for (const p of pieces) blendOnto(dst, p.surface, p.blend, p.opacity);
}

/**
 * Composite `layers` (bottom → top) onto `dst`. With `stopAtDynamic`, stops (throws STOP)
 * at the first layer that must stay live (text, smart-object photo, tagged layer).
 */
function compositeList(dst: Surface, layers: PsdLayer[], env: Env, stopAtDynamic: boolean): void {
  for (const { base, clipped } of clipGroups(layers)) {
    if (base.hidden) {
      if (stopAtDynamic) [base, ...clipped].forEach((l) => markBaked(l, env));
      continue;
    }
    if (stopAtDynamic && (containsDynamic(base, env) || clipped.some((c) => containsDynamic(c, env)))) {
      if (isGroup(base) && isPassThrough(base) && (base.opacity ?? 1) >= 1 && !base.mask && !hasEffects(base) && !clipped.length) {
        compositeList(dst, base.children!, env, true); // throws inside
      }
      throw STOP;
    }
    drawNode(dst, base, clipped, env);
    if (stopAtDynamic) [base, ...clipped].forEach((l) => markBaked(l, env));
  }
}

// ─── Emission of live layers ───────────────────────────────────────────

interface EmitCtx {
  env: Env;
  assets: ImportedAsset[];
  report: LayerReport[];
  opts: Required<Pick<ImportOptions, 'newAssetId'>> & ImportOptions;
  noteFont: (psName: string, layer: string) => void;
}

const layerId = (path: string, e: EmitCtx) => e.opts.layerIdFor?.(path) ?? nanoid(10);

async function rasterFrom(s: Surface, name: string, path: string, piece: Pick<Piece, 'blend' | 'opacity'>, e: EmitCtx): Promise<LayerInput | null> {
  const r = alphaBounds(s);
  if (!r) return null;
  const body = await encodePng(crop(s, r));
  const id = e.opts.newAssetId();
  e.assets.push({ id, kind: 'LAYER', name, mime: 'image/png', body, width: r.w, height: r.h });
  const { blend, exact } = cssBlend(piece.blend);
  if (!exact) e.env.warn(`Blend mode "${piece.blend}" approximated as "${blend}" (layer "${name}")`);
  return { id: layerId(path, e), name, type: 'raster', assetId: id, x: r.x, y: r.y, width: r.w, height: r.h, opacity: piece.opacity, blendMode: blend };
}

async function emitList(layers: PsdLayer[], parentPath: string, e: EmitCtx): Promise<LayerInput[]> {
  const out: LayerInput[] = [];
  const { env } = e;
  for (const { base, clipped } of clipGroups(layers)) {
    const path = `${parentPath}/${base.name ?? ''}`;
    if (env.baked.has(base)) continue;
    if (base.hidden) {
      e.report.push({ path, type: isGroup(base) ? 'group' : base.text ? 'text' : 'raster', status: 'skipped', notes: 'hidden' });
      continue;
    }

    if (base.text) {
      out.push(convertText(base, layerId(path, e), { globalAngle: env.globalAngle, fontIdFor: e.opts.fontIdFor ?? (() => undefined), warn: env.warn, noteFont: e.noteFont }));
      e.report.push({ path, type: 'text', status: 'editable' });
      if (base.mask && !base.mask.disabled) env.warn(`Layer mask on text "${base.name}" is not applied to live text`);
      if (clipped.length) {
        // Layers clipped to text are baked against the designed text shape.
        const content = layerContent(base, env);
        if (content) {
          const body = copy(content);
          applyClipped(body, clipped, env);
          const r = await rasterFrom(body, `${base.name} (clipped)`, `${path}#clipped`, { blend: 'normal', opacity: 1 }, e);
          if (r) out.push(r);
          env.warn(`Layers clipped to text "${base.name}" follow the designed text shape, not edited text`);
        }
      }
      continue;
    }

    if (base.adjustment) {
      env.warn(`Adjustment "${base.adjustment.type}" above live layers is dropped ("${base.name}")`);
      e.report.push({ path, type: 'adjustment', status: 'skipped', notes: 'above live layers' });
      continue;
    }

    if (isGroup(base)) {
      const dynamic = containsDynamic(base, env) || clipped.some((c) => containsDynamic(c, env));
      const blendChildren = base.children!.some((c) => !c.hidden && c.blendMode && !['normal', 'pass through'].includes(c.blendMode));
      const canBake = !dynamic && (!isPassThrough(base) || !blendChildren || hasEffects(base) || clipped.length > 0);
      if (canBake) {
        const content = contentOf(base, env);
        if (content) {
          const pieces = renderWithEffects(base, content, env);
          applyClipped(pieces[pieces.length - 1]!.surface, clipped, env);
          for (const p of pieces) {
            const r = await rasterFrom(p.surface, p.role === 'shadow' ? `${base.name} (shadow)` : (base.name ?? 'Group'), p.role === 'shadow' ? `${path}#shadow` : path, p, e);
            if (r) out.push(r);
          }
        }
        e.report.push({ path, type: 'group', status: 'rasterized', notes: 'flattened (no live layers inside)' });
        continue;
      }
      if (base.mask && !base.mask.disabled && maskSurface(base.mask, env)) env.warn(`Group mask on "${base.name}" is not applied to its live layers`);
      if (hasEffects(base)) env.warn(`Group effects on "${base.name}" are not applied to its live layers`);
      if (clipped.length) env.warn(`Layers clipped to group "${base.name}" are dropped`);
      const children = await emitList(base.children!, path, e);
      const { blend, exact } = cssBlend(isPassThrough(base) ? 'normal' : base.blendMode);
      if (!exact) env.warn(`Blend mode "${base.blendMode}" approximated as "${blend}" (group "${base.name}")`);
      out.push({ id: layerId(path, e), name: base.name ?? 'Group', type: 'group', x: 0, y: 0, width: env.W, height: env.H, opacity: base.opacity ?? 1, blendMode: blend, children });
      e.report.push({ path, type: 'group', status: 'editable' });
      continue;
    }

    const content = contentOf(base, env);
    if (!content) {
      e.report.push({ path, type: 'raster', status: 'skipped', notes: 'no pixels' });
      continue;
    }
    const pieces = renderWithEffects(base, content, env);
    applyClipped(pieces[pieces.length - 1]!.surface, clipped, env);
    for (const p of pieces) {
      const name = p.role === 'shadow' ? `${base.name} (shadow)` : (base.name ?? 'Layer');
      const r = await rasterFrom(p.surface, name, p.role === 'shadow' ? `${path}#shadow` : path, p, e);
      if (r) out.push(r);
    }
    e.report.push({ path, type: 'raster', status: 'rasterized', notes: [base.placedLayer ? 'smart object' : '', clipped.length ? `${clipped.length} clipped layer(s) merged` : ''].filter(Boolean).join(', ') || undefined });
  }
  return out;
}

function countLayers(layers: PsdLayer[] | undefined): number {
  return (layers ?? []).reduce((n, l) => n + 1 + countLayers(l.children), 0);
}

/**
 * PSD → draft Template Document (layers only) + assets + import report.
 *
 * Everything below the first live layer (text, smart-object photo, `@`-tagged layer) is
 * composited into one exact background with our Photoshop-compatible compositor
 * (blend modes, masks, clipping, effects, adjustments). Layers from there up are kept
 * individually: text stays live, everything else becomes rasters with their effects and
 * masks baked in and their blend mode mapped to CSS.
 */
export async function importPsd(buffer: Buffer | Uint8Array, opts: ImportOptions): Promise<ImportResult> {
  const started = Date.now();
  ensureAgPsdCanvas();
  const psd = readPsd(buffer, { skipThumbnail: true, useImageData: false });
  const W = psd.width, H = psd.height;
  const warnings = new Set<string>();
  const canvasArea = W * H;

  const env: Env = {
    W,
    H,
    psd,
    globalAngle: psd.imageResources?.globalAngle ?? 120,
    warn: (m) => warnings.add(m),
    baked: new Set(),
    isDynamic: (l) => {
      if (l.hidden) return false;
      if (l.text) return true;
      if (TAG_RE.test(l.name ?? '')) return true;
      if (l.placedLayer && l.placedLayer.type !== 'vector') {
        const area = ((l.right ?? 0) - (l.left ?? 0)) * ((l.bottom ?? 0) - (l.top ?? 0));
        return area >= canvasArea * 0.04;
      }
      return false;
    },
  };
  if (psd.bitsPerChannel && psd.bitsPerChannel !== 8) warnings.add(`${psd.bitsPerChannel}-bit document: colours are converted to 8-bit`);
  if (psd.colorMode !== undefined && psd.colorMode !== 3) warnings.add('Document is not RGB: colours may shift');

  const assets: ImportedAsset[] = [];
  const report: LayerReport[] = [];
  const fontUses = new Map<string, Set<string>>();
  const fullOpts = { ...opts, newAssetId: opts.newAssetId ?? (() => nanoid()) };
  const e: EmitCtx = {
    env,
    assets,
    report,
    opts: fullOpts,
    noteFont: (ps, layer) => {
      if (!fontUses.has(ps)) fontUses.set(ps, new Set());
      fontUses.get(ps)!.add(layer);
    },
  };

  // 1) Bake everything below the first live layer.
  const background = surface(W, H);
  try {
    compositeList(background, psd.children ?? [], env, true);
  } catch (err) {
    if (err !== STOP) throw err;
  }
  const layers: LayerInput[] = [];
  if (env.baked.size) {
    const r = await rasterFrom(background, 'Background (merged)', '/__background', { blend: 'normal', opacity: 1 }, e);
    if (r) layers.push(r);
    report.push({ path: '/__background', type: 'merged', status: 'merged', notes: `${[...env.baked].filter((l) => !l.hidden).length} layers merged below the first live layer` });
  }

  // 2) Live and individual layers above it.
  layers.push(...(await emitList(psd.children ?? [], '', e)));

  // 3) Composite for QA / "show original".
  let compositeAssetId: string | undefined;
  if (psd.canvas) {
    compositeAssetId = fullOpts.newAssetId();
    assets.push({ id: compositeAssetId, kind: 'COMPOSITE', name: 'composite', mime: 'image/png', body: await encodePng(psd.canvas as unknown as Surface), width: W, height: H });
  } else {
    warnings.add('PSD has no composite image ("Maximize compatibility" was off): QA comparison is unavailable');
  }

  const input: TemplateDocumentInput = {
    schemaVersion: SCHEMA_VERSION,
    canvas: { width: W, height: H, background: '#ffffff' },
    layers,
    fields: [],
    fonts: [],
    meta: { source: 'psd', sourceFileName: opts.fileName, compositeAssetId },
  };
  const document = TemplateDocument.parse(input);
  const fontIds = new Set<string>();
  for (const ps of fontUses.keys()) {
    const id = opts.fontIdFor?.(ps);
    if (id) fontIds.add(id);
  }
  document.fonts = [...fontIds].map((fontId) => ({ fontId }));

  const missingFonts = [...fontUses]
    .filter(([ps]) => !opts.fontIdFor?.(ps))
    .map(([psdName, ls]) => ({ psdName, layers: [...ls] }));

  const counts = {
    total: countLayers(psd.children),
    editable: report.filter((r) => r.status === 'editable' && r.type === 'text').length,
    rasterized: report.filter((r) => r.status === 'rasterized').length,
    merged: [...env.baked].filter((l) => !l.hidden && !isGroup(l)).length,
    skipped: report.filter((r) => r.status === 'skipped').length,
  };

  return {
    document,
    assets,
    report: {
      fileName: opts.fileName,
      width: W,
      height: H,
      counts,
      layers: report,
      warnings: [...warnings],
      missingFonts,
      suggestedFields: suggestFields(document),
      durationMs: Date.now() - started,
    },
  };
}
