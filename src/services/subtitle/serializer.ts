import { type SubtitleItem } from '@/types/subtitle';

/**
 * Serializes a subtitle item for hashing/comparison purposes.
 * Format: id|startTime|endTime|original|translated|comment|speaker
 */
export const serializeSubtitleItem = (item: SubtitleItem): string => {
  return `${item.id}|${item.startTime}|${item.endTime}|${item.original}|${item.translated}|${item.comment || ''}|${item.speaker || ''}`;
};
