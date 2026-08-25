import type { ApiError, BdErrorKind } from '@beadviz/contract';

/**
 * Every failure that can reach the UI carries a cause and a fix. §7 forbids the
 * bare spinner that never resolves, and the only way to keep that promise is to
 * make the hint a required field at the point the error is constructed.
 */
export class AppError extends Error {
  readonly kind: BdErrorKind;
  readonly hint: string;
  readonly detail?: string;
  readonly httpStatus: number;

  constructor(kind: BdErrorKind, message: string, hint: string, detail?: string) {
    super(message);
    this.name = 'AppError';
    this.kind = kind;
    this.hint = hint;
    this.detail = detail;
    this.httpStatus = HTTP_STATUS[kind];
  }

  toPayload(): ApiError {
    return {
      error: {
        kind: this.kind,
        message: this.message,
        hint: this.hint,
        ...(this.detail ? { detail: this.detail } : {}),
      },
    };
  }
}

const HTTP_STATUS: Record<BdErrorKind, number> = {
  'binary-missing': 503,
  'no-beads-dir': 503,
  'dolt-down': 503,
  'bad-json': 502,
  'cli-error': 502,
  timeout: 504,
  'bad-request': 400,
  'not-found': 404,
  unsupported: 501,
};

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

/** Anything that escapes untyped still has to answer "what do I do about it?". */
export function toAppError(e: unknown): AppError {
  if (isAppError(e)) return e;
  const message = e instanceof Error ? e.message : String(e);
  return new AppError(
    'cli-error',
    message,
    'Check the sidecar log for the failing command, then re-run it by hand.',
  );
}
