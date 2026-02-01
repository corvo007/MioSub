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
