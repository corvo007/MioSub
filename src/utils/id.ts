/**
 * Generates a short, random 8-character alphanumeric ID.
 * Collision probability is extremely low for subtitle lists.
 * Format: 8 chars (a-z, 0-9)
 */
export const generateSubtitleId = (): string => {
  return Math.random().toString(36).substring(2, 10);
};
