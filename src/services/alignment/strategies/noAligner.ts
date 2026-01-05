/**
 * No Alignment Strategy
 *
 * Pass-through implementation that preserves original timestamps from Step 1.
 */

import { type SubtitleItem } from '@/types/subtitle';
import { type AlignmentStrategy } from '@/types/alignment';

export class NoAligner implements AlignmentStrategy {
  readonly name = 'none' as const;

  async align(
    segments: SubtitleItem[],
    _audioPath?: string,
    _language?: string,
    _context?: any,
    _audioBase64?: string
  ): Promise<SubtitleItem[]> {
    // Simply return segments unchanged
    return segments;
  }
}
