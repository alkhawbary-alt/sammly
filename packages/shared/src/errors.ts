/** Stable error codes shared by the API, worker, admin and (later) the mobile app. */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  TEXT_OVERFLOW: 'TEXT_OVERFLOW',
  PLAN_FEATURE_LOCKED: 'PLAN_FEATURE_LOCKED',
  INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS',
  FONT_UNMAPPED: 'FONT_UNMAPPED',
  FIELD_MISSING_IN_VARIANT: 'FIELD_MISSING_IN_VARIANT',
  UNSUPPORTED_SCHEMA_VERSION: 'UNSUPPORTED_SCHEMA_VERSION',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
}

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  toBody(): ApiErrorBody {
    return { error: { code: this.code, message: this.message, details: this.details } };
  }
}
