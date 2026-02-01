/**
 * Custom error classes for the application
 */

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
  constructor(message: string) {
    super(message);
    this.name = 'UserActionableError';
  }
}
