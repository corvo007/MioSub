/**
 * Alignment Strategy Factory
 *
 * Creates the appropriate alignment strategy based on settings.
 */

import { type AppSettings } from '@/types/settings';
import { type AlignmentStrategy } from '@/types/alignment';
import { NoAligner } from './strategies/noAligner';
import { CTCAligner } from './strategies/ctcAligner';
import { logger } from '@/services/utils/logger';

/**
 * Create an alignment strategy based on app settings.
 *
 * @param settings - Application settings containing alignment configuration
 * @returns Configured alignment strategy
 */
export function createAligner(settings: AppSettings): AlignmentStrategy {
  const mode = settings.alignmentMode || 'none';

  switch (mode) {
    case 'ctc':
      // Validate CTC configuration
      if (!settings.alignerPath) {
        logger.warn(
          'CTC alignment requested but alignerPath not configured, falling back to none',
          {
            toast: true,
            toastType: 'warning',
          }
        );
        return new NoAligner();
      }
      if (!settings.alignmentModelPath) {
        logger.warn(
          'CTC alignment requested but alignmentModelPath not configured, falling back to none',
          { toast: true, toastType: 'warning' }
        );
        return new NoAligner();
      }

      return new CTCAligner({
        alignerPath: settings.alignerPath,
        modelPath: settings.alignmentModelPath,
      });

    case 'none':
    default:
      return new NoAligner();
  }
}

/**
 * Re-export types for convenience
 */
export type { AlignmentStrategy } from '@/types/alignment';
export { NoAligner } from './strategies/noAligner';
export { CTCAligner } from './strategies/ctcAligner';
