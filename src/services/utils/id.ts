/**
 * Generates a short, random 8-character alphanumeric ID.
 * Collision probability is extremely low for subtitle lists.
 * Format: 4 chars (a-z, 0-9) - 1.6M combinations, sufficient for subtitles and saves tokens
 */
export const generateSubtitleId = (): string => {
  return Math.random().toString(36).substring(2, 6).padEnd(4, '0');
};
