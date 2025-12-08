/**
 * Color palette optimized for accessibility and visual distinction
 * WCAG AA compliant for text contrast on dark backgrounds
 */
const SPEAKER_COLORS = [
  '#00FFFF', // Cyan (High vis)
  '#FF3333', // Bright Red
  '#00FF00', // Lime Green
  '#FFFF00', // Yellow
  '#FF00FF', // Magenta
  '#FFA500', // Orange
  '#00BFFF', // Deep Sky Blue
  '#FF1493', // Deep Pink
  '#7FFFD4', // Aquamarine
  '#FFD700', // Gold
  '#B088FF', // Light Purple
  '#32CD32', // Lime
  '#FF69B4', // Hot Pink
  '#DDA0DD', // Plum
  '#00FA9A', // Medium Spring Green
  '#6495ED', // Cornflower Blue
];

/**
 * Generate consistent color for a speaker
 * @param speaker - Speaker identifier (e.g., "Speaker 1", "Speaker 2")
 * @returns Hex color code
 */
export function getSpeakerColor(speaker: string): string {
  if (!speaker) return '#FFFFFF'; // White for undefined (same as before)

  // Extract number from "Speaker X" format
  const match = speaker.match(/\d+/);
  if (match) {
    const index = parseInt(match[0], 10) - 1; // 0-indexed
    return SPEAKER_COLORS[index % SPEAKER_COLORS.length];
  }

  // Fallback: hash the speaker string using djb2 algorithm (better distribution)
  let hash = 5381;
  for (let i = 0; i < speaker.length; i++) {
    // Use charCodeAt to handle Unicode characters properly
    const char = speaker.charCodeAt(i);
    hash = (hash << 5) + hash + char; // hash * 33 + char
  }
  // Use unsigned 32-bit integer to avoid negative numbers
  const index = (hash >>> 0) % SPEAKER_COLORS.length;
  return SPEAKER_COLORS[index];
}
