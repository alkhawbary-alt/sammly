export * from './errors';
export * from './plans';

export const API_PREFIX = '/api/v1';
export const DEFAULT_LOCALE = 'ar';
export const LOCALES = ['ar', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
