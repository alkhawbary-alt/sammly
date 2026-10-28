import { z } from 'zod';

export const PlanCode = z.enum(['BASIC', 'BUSINESS', 'PRO']);
export type PlanCode = z.infer<typeof PlanCode>;

const PLAN_RANK: Record<PlanCode, number> = { BASIC: 0, BUSINESS: 1, PRO: 2 };

export function planRank(code: PlanCode): number {
  return PLAN_RANK[code];
}

/** Typed shape of `Plan.features` (stored as JSON in the DB). */
export const PlanFeatures = z.object({
  /** Number of size variants a business may export per template (1 = primary only). */
  maxVariants: z.number().int().min(1),
  hdExport: z.boolean(),
  pdfExport: z.boolean(),
  aiRewrite: z.boolean(),
  /** How many rewrite options are returned per request. */
  aiRewriteOptions: z.number().int().min(1).max(10).default(3),
  bgRemoval: z.boolean(),
  imageEnhance: z.boolean(),
  multipleOptions: z.boolean(),
  templateTiers: z.array(PlanCode),
});
export type PlanFeatures = z.infer<typeof PlanFeatures>;

export const DEFAULT_PLAN_FEATURES: Record<PlanCode, PlanFeatures> = {
  BASIC: {
    maxVariants: 1,
    hdExport: false,
    pdfExport: false,
    aiRewrite: true,
    aiRewriteOptions: 3,
    bgRemoval: false,
    imageEnhance: false,
    multipleOptions: false,
    templateTiers: ['BASIC'],
  },
  BUSINESS: {
    maxVariants: 2,
    hdExport: true,
    pdfExport: true,
    aiRewrite: true,
    aiRewriteOptions: 3,
    bgRemoval: true,
    imageEnhance: true,
    multipleOptions: false,
    templateTiers: ['BASIC', 'BUSINESS'],
  },
  PRO: {
    maxVariants: 99,
    hdExport: true,
    pdfExport: true,
    aiRewrite: true,
    aiRewriteOptions: 5,
    bgRemoval: true,
    imageEnhance: true,
    multipleOptions: true,
    templateTiers: ['BASIC', 'BUSINESS', 'PRO'],
  },
};
