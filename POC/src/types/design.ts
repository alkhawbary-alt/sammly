import { z } from 'zod';

export const TextStyleSchema = z.object({
  fontSize: z.number().optional().default(16),
  fontFamily: z.string().optional().default('sans-serif'),
  fontWeight: z.union([z.string(), z.number()]).optional().default('normal'),
  fontStyle: z.enum(['normal', 'italic']).optional().default('normal'),
  color: z.string().optional().default('#000000'),
  textAlign: z.enum(['left', 'center', 'right', 'justify']).optional().default('left'),
  lineHeight: z.union([z.number(), z.string()]).optional(),
  letterSpacing: z.number().optional(),
  textDecoration: z.string().optional(),
});

export const BaseLayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  opacity: z.number().min(0).max(1).optional().default(1),
  rotation: z.number().optional().default(0),
  visible: z.boolean().optional().default(true),
  zIndex: z.number().optional(),
  blendMode: z.string().optional(),
});

export const TextLayerSchema = BaseLayerSchema.extend({
  type: z.literal('text'),
  text: z.string(),
  style: TextStyleSchema.optional().default({}),
});

export const ImageLayerSchema = BaseLayerSchema.extend({
  type: z.literal('image'),
  src: z.string(),
  fit: z.enum(['contain', 'cover', 'fill', 'none']).optional().default('contain'),
  originalFileName: z.string().optional(),
});

export const RasterLayerSchema = BaseLayerSchema.extend({
  type: z.literal('raster'),
  src: z.string(),
  fit: z.enum(['contain', 'cover', 'fill', 'none']).optional().default('contain'),
  originalFileName: z.string().optional(),
});

export const ShapeLayerSchema = BaseLayerSchema.extend({
  type: z.literal('shape'),
  shapeType: z.enum(['rectangle', 'ellipse', 'circle', 'line']).default('rectangle'),
  fill: z.string().optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().optional().default(0),
  borderRadius: z.union([z.number(), z.string()]).optional().default(0),
});

export const SvgLayerSchema = BaseLayerSchema.extend({
  type: z.literal('svg'),
  svgContent: z.string().optional(),
  src: z.string().optional(),
});

export type Layer =
  | z.infer<typeof TextLayerSchema>
  | z.infer<typeof ImageLayerSchema>
  | z.infer<typeof RasterLayerSchema>
  | z.infer<typeof ShapeLayerSchema>
  | z.infer<typeof SvgLayerSchema>
  | GroupLayer;

export interface GroupLayer extends z.infer<typeof BaseLayerSchema> {
  type: 'group';
  children: Layer[];
}

export const LayerSchema: z.ZodType<Layer> = z.lazy(() =>
  z.discriminatedUnion('type', [
    TextLayerSchema,
    ImageLayerSchema,
    RasterLayerSchema,
    ShapeLayerSchema,
    SvgLayerSchema,
    BaseLayerSchema.extend({
      type: z.literal('group'),
      children: z.array(LayerSchema),
    }),
  ])
);

export const DesignDocumentSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional().default('Untitled Design'),
  width: z.number().positive(),
  height: z.number().positive(),
  backgroundColor: z.string().optional().default('#ffffff'),
  layers: z.array(LayerSchema),
  meta: z
    .object({
      sourceFormat: z.enum(['psd', 'png', 'jpg', 'jpeg', 'webp', 'svg', 'json']).optional(),
      originalFileName: z.string().optional(),
      importedAt: z.string().optional(),
      compositeUrl: z.string().optional(),
    })
    .optional(),
});

export type DesignDocument = z.infer<typeof DesignDocumentSchema>;
export type TextStyle = z.infer<typeof TextStyleSchema>;

export interface ImportReportItem {
  layerId: string;
  name: string;
  type: string;
  status: 'editable' | 'rasterized' | 'skipped';
  notes?: string;
}

export interface ImportReport {
  totalLayers: number;
  editableLayers: number;
  rasterizedLayers: number;
  unsupportedFeatures: string[];
  missingFonts: string[];
  warnings: string[];
  details: ImportReportItem[];
}
