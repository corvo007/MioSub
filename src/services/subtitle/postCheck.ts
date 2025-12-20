/**
 * PostCheck Module - Post-processing framework for subtitle generation
 *
 * Provides a unified pipeline for:
 * 1. Retry logic for recoverable errors
 * 2. Quality validation framework
 *
 * Business-specific postprocessors are in pipeline/postProcessors.ts
 */

import { logger } from '@/services/utils/logger';

// ===== Interfaces =====

export interface PostCheckIssue {
  type: 'corrupted_range' | 'regression' | 'excessive_duration';
  affectedIds: string[];
  details: string;
  retryable: boolean;
}

export interface PostCheckResult {
  isValid: boolean;
  issues: PostCheckIssue[];
  retryable: boolean; // true if at least one issue is retryable
}

export interface PostProcessOutput<T> {
  result: T;
  checkResult: PostCheckResult;
}

export interface WithPostCheckOptions {
  maxRetries: number;
  stepName?: string; // For logging (e.g., "Chunk 3")
}

// Post-process function signature - receives isFinalAttempt to know if markers should be applied
// Supports both sync and async post-processors
// TInput: type of raw result from generate()
// TOutput: type of processed result
export type PostProcessFn<TInput, TOutput = TInput> = (
  result: TInput,
  isFinalAttempt: boolean
) => PostProcessOutput<TOutput> | Promise<PostProcessOutput<TOutput>>;

// ===== Retry Wrapper =====

/**
 * Execute a generator function with post-check and retry logic
 *
 * @param generate - Async function that produces the raw result
 * @param postProcess - Function to post-process and validate the result
 * @param options - Retry configuration
 * @returns Final result with check status
 *
 * TInput: type of raw result from generate()
 * TOutput: type of processed result (defaults to TInput for same-type transforms)
 */
export async function withPostCheck<TInput, TOutput = TInput>(
  generate: () => Promise<TInput>,
  postProcess: PostProcessFn<TInput, TOutput>,
  options: WithPostCheckOptions
): Promise<PostProcessOutput<TOutput>> {
  const { maxRetries, stepName = '' } = options;
  let lastOutput: PostProcessOutput<TOutput> | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const isFinalAttempt = attempt === maxRetries;

    // Generate
    const rawResult = await generate();

    // Post-process and validate (pass isFinalAttempt to apply markers on final pass)
    // Supports both sync and async post-processors
    const output = await postProcess(rawResult, isFinalAttempt);
    lastOutput = output;

    // Check if valid or not retryable
    if (output.checkResult.isValid || !output.checkResult.retryable) {
      if (attempt > 0 && output.checkResult.isValid) {
        logger.info(`${stepName} PostCheck: Succeeded on retry ${attempt}`);
      }
      return output;
    }

    // Log and retry if attempts remain
    if (attempt < maxRetries) {
      logger.warn(
        `${stepName} PostCheck: Retryable issues detected, retrying (${attempt + 1}/${maxRetries})`,
        { issues: output.checkResult.issues.map((i) => i.type) }
      );
    }
  }

  // All retries exhausted
  logger.error(`${stepName} PostCheck: Issues persisted after ${maxRetries} retries`);
  return lastOutput!;
}
