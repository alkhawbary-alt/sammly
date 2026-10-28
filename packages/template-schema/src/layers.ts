import { z } from 'zod';
import { AssetId, Color } from './common';

/** Blend modes Chromium can draw. Others are rasterized by the importer. */
export const BlendMode = z.enum([
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
  /** Photoshop "linear dodge (add)". */
  'plus-lighter',
]);
export type BlendMode = z.infer<typeof BlendMode>;

const BaseLayer = z.object({
  /** Stable short id (nanoid); survives re-imports when the layer path matches. */
  id: z.string().min(1),
  name: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  visible: z.boolean().default(true),
  blendMode: BlendMode.default('normal'),
  /** Locked layers keep the template identity: only fields may change them. */
  locked: z.boolean().default(true),
});

// ─── Text ──────────────────────────────────────────────────────────────

export const TextAlign = z.enum(['start', 'center', 'end', 'justify']);

export const TextStyle = z.object({
  /** Font library id. Missing → the font is unmapped (blocks publishing). */
  fontId: z.string().optional(),
  /** Fallback family name (the PSD font name for unmapped fonts). */
  fontFamily: z.string().default('sans-serif'),
  fontSize: z.number().positive(),
  fontWeight: z.number().int().min(100).max(900).default(400),
  fontStyle: z.enum(['normal', 'italic']).default('normal'),
  color: Color.default('#000000'),
  align: TextAlign.default('start'),
  /** Line height in px. Emitted as a ratio of fontSize so auto-fit scales it. */
  lineHeight: z.number().positive().optional(),
  /** Tracking in px. Never applied to RTL text (it breaks Arabic joining). */
  letterSpacing: z.number().optional(),
  textDecoration: z.enum(['none', 'underline', 'line-through']).default('none'),
});
export type TextStyle = z.infer<typeof TextStyle>;

export const TextRun = z.object({
  text: z.string(),
  style: TextStyle.partial(),
});
export type TextRun = z.infer<typeof TextRun>;

export const TextFit = z.object({
  /**
   * none        → draw as designed (may overflow)
   * shrink      → keep line breaks as typed, shrink until it fits
   * wrap-shrink → wrap at the box width, then shrink until it fits (and ≤ maxLines)
   */
  mode: z.enum(['none', 'shrink', 'wrap-shrink']).default('none'),
  minFontSize: z.number().positive().default(8),
  maxLines: z.number().int().positive().optional(),
});
export type TextFit = z.infer<typeof TextFit>;

export const TextLayer = BaseLayer.extend({
  type: z.literal('text'),
  text: z.string(),
  direction: z.enum(['rtl', 'ltr', 'auto']).default('auto'),
  /** point → no automatic wrapping; box → paragraph text wrapped at width. */
  textBox: z.enum(['point', 'box']).default('box'),
  verticalAlign: z.enum(['top', 'middle', 'bottom']).default('top'),
  style: TextStyle,
  /** Multi-style text (non-editable layers only). When present, `text` is the concatenation. */
  runs: z.array(TextRun).optional(),
  fit: TextFit.default({ mode: 'none', minFontSize: 8 }),
  /**
   * Distance from the box top to the first baseline (box-local px). When set, the first line
   * sits exactly on it whatever the font metrics are — how Photoshop point text is anchored.
   */
  baseline: z.number().optional(),
  shadow: z.object({ color: Color, x: z.number(), y: z.number(), blur: z.number().nonnegative() }).optional(),
  /** Outside stroke. */
  stroke: z.object({ color: Color, width: z.number().positive() }).optional(),
});
export type TextLayer = z.infer<typeof TextLayer>;

// ─── Bitmaps ───────────────────────────────────────────────────────────

export const ImageLayer = BaseLayer.extend({
  type: z.literal('image'),
  assetId: AssetId,
  fit: z.enum(['contain', 'cover', 'fill']).default('contain'),
});
export type ImageLayer = z.infer<typeof ImageLayer>;

/** Pixel-exact fallback for anything CSS can't reproduce (effects, adjustments, gradients…). */
export const RasterLayer = BaseLayer.extend({
  type: z.literal('raster'),
  assetId: AssetId,
  /** Photoshop clipping mask: clipped to the alpha of the layer directly below. */
  clipping: z.boolean().default(false),
});
export type RasterLayer = z.infer<typeof RasterLayer>;

// ─── Vector ────────────────────────────────────────────────────────────

export const ShapeLayer = BaseLayer.extend({
  type: z.literal('shape'),
  shape: z.enum(['rectangle', 'ellipse']).default('rectangle'),
  fill: Color.optional(),
  stroke: Color.optional(),
  strokeWidth: z.number().nonnegative().default(0),
  radius: z.number().nonnegative().default(0),
});
export type ShapeLayer = z.infer<typeof ShapeLayer>;

export const SvgLayer = BaseLayer.extend({
  type: z.literal('svg'),
  /** Sanitized SVG markup (DOMPurify on upload) or an asset id. */
  svgContent: z.string().optional(),
  assetId: AssetId.optional(),
}).refine((l) => l.svgContent !== undefined || l.assetId !== undefined, {
  message: 'svg layer needs svgContent or assetId',
});
export type SvgLayer = z.infer<typeof SvgLayer>;

// ─── Image slot ────────────────────────────────────────────────────────

export const SlotMask = z.discriminatedUnion('kind', [
  /** Alpha mask PNG stretched over the slot box. */
  z.object({ kind: z.literal('alpha'), assetId: AssetId }),
  /** SVG path data in the slot's own pixel coordinates (0,0 = slot top-left). */
  z.object({ kind: z.literal('path'), svgPath: z.string().regex(/^[MmLlHhVvCcSsQqTtAaZz0-9\s,.eE+-]+$/) }),
  z.object({
    kind: z.literal('shape'),
    shape: z.enum(['circle', 'roundedRect']),
    radius: z.number().nonnegative().optional(),
  }),
]);
export type SlotMask = z.infer<typeof SlotMask>;

/** A box where a user or brand image goes (photo, logo). */
export const ImageSlotLayer = BaseLayer.extend({
  type: z.literal('imageSlot'),
  fit: z.enum(['cover', 'contain']).default('cover'),
  mask: SlotMask.optional(),
  placeholderAssetId: AssetId.optional(),
  /** Drawn when there is neither a value nor a placeholder. */
  emptyColor: Color.optional(),
  allowUserCrop: z.boolean().default(true),
});
export type ImageSlotLayer = z.infer<typeof ImageSlotLayer>;

// ─── Group & union ─────────────────────────────────────────────────────

export type GroupLayer = z.infer<typeof BaseLayer> & { type: 'group'; children: Layer[] };
type GroupLayerInput = z.input<typeof BaseLayer> & { type: 'group'; children: LayerInput[] };

export type Layer = TextLayer | ImageLayer | RasterLayer | ShapeLayer | SvgLayer | ImageSlotLayer | GroupLayer;
export type LayerInput =
  | z.input<typeof TextLayer>
  | z.input<typeof ImageLayer>
  | z.input<typeof RasterLayer>
  | z.input<typeof ShapeLayer>
  | z.input<typeof SvgLayer>
  | z.input<typeof ImageSlotLayer>
  | GroupLayerInput;

/**
 * Children of a group use canvas coordinates (same as top-level layers);
 * the group's own box is informational and its opacity/blend/visibility apply to all children.
 */
export const GroupLayer: z.ZodType<GroupLayer, GroupLayerInput> = BaseLayer.extend({
  type: z.literal('group'),
  children: z.lazy(() => z.array(Layer)),
}) as unknown as z.ZodType<GroupLayer, GroupLayerInput>;

export const Layer: z.ZodType<Layer, LayerInput> = z.lazy(() =>
  z.union([TextLayer, ImageLayer, RasterLayer, ShapeLayer, SvgLayer, ImageSlotLayer, GroupLayer]),
) as unknown as z.ZodType<Layer, LayerInput>;

export type LayerType = Layer['type'];
