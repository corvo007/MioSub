/**
 * Custom error classes for the application
 */

/**
 * Error codes for user-actionable errors
 */
export type UserActionableErrorCode =
  | 'INVALID_API_KEY'
  | 'RATE_LIMITED'
  | 'PERMISSION_DENIED'
  | 'BILLING_REQUIRED'
  | 'REGION_RESTRICTED'
  | 'MODEL_NOT_FOUND'
  | 'NOT_FOUND'
  | 'NO_SUBTITLES'
  | 'UNKNOWN';

/**
 * Error class for user-actionable errors that should NOT be reported to Sentry.
 *
 * These are expected errors that users can resolve themselves:
 * - API key invalid/missing
 * - Rate limit / quota exceeded
 * - Billing issues
 * - Permission denied
 * - Region restrictions
 *
 * Use this class when throwing errors that are caused by user configuration
 * or external service limits, not by application bugs.
 */
export class UserActionableError extends Error {
  code: UserActionableErrorCode;

  constructor(message: string, code: UserActionableErrorCode = 'UNKNOWN') {
    super(message);
    this.name = 'UserActionableError';
    this.code = code;
  }
}

/**
 * Detects transient errors that should NOT be reported to Sentry.
 * Covers: user cancellation, network failures, server errors (500/503/504),
 * process kills, and HTML error pages from API proxies.
 */
export function isTransientError(error: any): boolean {
  if (!error) return false;

  // ExpectedError (cancellation, user-initiated kills)
  if ((error as any).isExpected === true) return true;

  // Cancellation (structured check)
  const name = error.name || '';
  if (name === 'AbortError' || name === 'StepCancelledError') return true;

  const msg = (error.message || '').toLowerCase();

  // Network / fetch errors
  const errorCode = ((error as any).code || '').toUpperCase();
  if (
    errorCode === 'ECONNRESET' ||
    errorCode === 'ETIMEDOUT' ||
    errorCode === 'ENOTFOUND' ||
    errorCode === 'ECONNREFUSED' ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network error') ||
    msg.includes('socket hang up')
  )
    return true;

  // Server transient errors (Gemini 500/503/504)
  if (
    msg.includes('[500') ||
    msg.includes('[503') ||
    msg.includes('[504') ||
    msg.includes('internal server error') ||
    msg.includes('service unavailable') ||
    msg.includes('deadline exceeded')
  )
    return true;

  // HTML error page instead of JSON (API proxy/CDN errors)
  if (msg.includes('<!doctype') || msg.includes('<html')) return true;

  return false;
}

/**
 * Extracts a human-readable error message from any error object.
 * Handles Gemini SDK errors where message contains raw JSON like:
 *   {"error":{"code":503,"message":"...human text...","status":"UNAVAILABLE"}}
 */
export function getReadableErrorMessage(error: any): string {
  const raw: string = error?.message || '';
  try {
    const match = raw.match(/\{.*\}/s);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (parsed.error?.message) return parsed.error.message;
    }
  } catch {
    // not JSON, use raw
  }
  return raw;
}
