/**
 * Base Adapter
 * Abstract base class with common retry, timeout, and abort logic
 */

import type {
  ILLMAdapter,
  ProviderType,
  ProviderConfig,
  AdapterCapabilities,
  GenerateOptions,
} from '@/types/llm';
import { logger } from '@/services/utils/logger';
import i18n from '@/i18n';

/**
 * Options for executeWithRetry
 */
export interface RetryOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  retries?: number;
}

/**
 * Abstract Base Adapter
 * Provides common retry, timeout, and abort logic
 */
export abstract class BaseAdapter implements ILLMAdapter {
  abstract readonly type: ProviderType;
  abstract readonly capabilities: AdapterCapabilities;
  abstract readonly model: string;

  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  /**
   * Generate structured object response - must be implemented by subclass
   */
  abstract generateObject<T>(options: GenerateOptions): Promise<T>;

  /**
   * Check if request was aborted
   */
  protected checkAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new Error(i18n.t('services:api.network.cancelled'));
    }
  }

  /**
   * Execute a function with retry, timeout, and abort support
   */
  protected async executeWithRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const { signal, timeoutMs, retries = 3 } = options;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < retries; attempt++) {
      this.checkAborted(signal);

      try {
        // Execute with optional timeout
        if (timeoutMs && timeoutMs > 0) {
          return await this.executeWithTimeout(fn, timeoutMs, signal);
        }
        return await fn();
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(String(error));
        // Check if error is retryable
        if (this.isRetryableError(error) && attempt < retries - 1) {
          const delay = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
          logger.warn(`API error (retryable). Retrying in ${Math.round(delay)}ms...`, {
            attempt: attempt + 1,
            maxRetries: retries,
            error: error.message,
            status: error.status,
            model: this.model,
          });
          await this.sleep(delay);
        } else {
          throw error;
        }
      }
    }

    throw new Error(i18n.t('services:api.errors.retryFailed'), { cause: lastError });
  }

  /**
   * Execute with timeout using Promise.race
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let timeoutHandle: NodeJS.Timeout | null = null;
      let abortHandler: (() => void) | null = null;
      let settled = false;

      const cleanup = () => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (abortHandler && signal) signal.removeEventListener('abort', abortHandler);
      };

      // Timeout promise
      timeoutHandle = setTimeout(() => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(
            new Error(
              i18n.t('services:api.network.timeoutWithSeconds', {
                seconds: Math.round(timeoutMs / 1000),
              })
            )
          );
        }
      }, timeoutMs);

      // Abort handler
      if (signal) {
        if (signal.aborted) {
          cleanup();
          reject(new Error(i18n.t('services:api.network.cancelled')));
          return;
        }
        abortHandler = () => {
          if (!settled) {
            settled = true;
            cleanup();
            reject(new Error(i18n.t('services:api.network.cancelled')));
          }
        };
        signal.addEventListener('abort', abortHandler);
      }

      // Execute function
      fn()
        .then((result) => {
          if (!settled) {
            settled = true;
            cleanup();
            resolve(result);
          }
        })
        .catch((error) => {
          if (!settled) {
            settled = true;
            cleanup();
            reject(error);
          }
        });
    });
  }

  /**
   * Check if error is retryable
   * Subclasses can override for provider-specific logic
   */
  protected isRetryableError(error: any): boolean {
    if (!error) return false;

    const status = error.status || error.response?.status;
    const msg = (error.message || '').toLowerCase();
    const code = error.code || '';

    // Timeout errors
    if (
      code === 'ETIMEDOUT' ||
      code === 'ECONNABORTED' ||
      code === 'ENOTFOUND' ||
      msg.includes('timeout') ||
      msg.includes('timed out')
    ) {
      return true;
    }

    // Rate limits (429)
    if (
      status === 429 ||
      msg.includes('429') ||
      msg.includes('rate limit') ||
      msg.includes('resource has been exhausted') ||
      msg.includes('too many requests')
    ) {
      return true;
    }

    // Server errors (500, 503)
    if (status === 500 || status === 503 || msg.includes('503') || msg.includes('overloaded')) {
      return true;
    }

    // Network errors
    if (
      msg.includes('fetch failed') ||
      msg.includes('failed to fetch') ||
      msg.includes('network') ||
      msg.includes('econnrefused') ||
      msg.includes('econnreset') ||
      msg.includes('err_network')
    ) {
      return true;
    }

    // JSON parsing errors (often due to truncated response)
    if (msg.includes('json') || msg.includes('syntaxerror') || msg.includes('unexpected token')) {
      return true;
    }

    return false;
  }

  /**
   * Sleep utility
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
