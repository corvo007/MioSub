/**
 * Color palette optimized for accessibility and visual distinction
 * WCAG AA compliant for text contrast on dark backgrounds
 */
const SPEAKER_COLORS = [
    '#3b82f6', // Blue
    '#10b981', // Green
    '#f59e0b', // Amber
    '#ef4444', // Red
    '#8b5cf6', // Violet
    '#ec4899', // Pink
    '#06b6d4', // Cyan
    '#f97316', // Orange
    '#14b8a6', // Teal
    '#a855f7', // Purple
];

/**
 * Generate consistent color for a speaker
 * @param speaker - Speaker identifier (e.g., "Speaker 1", "Speaker 2")
 * @returns Hex color code
 */
export function getSpeakerColor(speaker: string): string {
    if (!speaker) return '#6b7280'; // Gray for undefined

    // Extract number from "Speaker X" format
    const match = speaker.match(/\d+/);
    if (match) {
        const index = parseInt(match[0], 10) - 1; // 0-indexed
        return SPEAKER_COLORS[index % SPEAKER_COLORS.length];
    }

    // Fallback: hash the speaker string
    let hash = 0;
    for (let i = 0; i < speaker.length; i++) {
        hash = speaker.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % SPEAKER_COLORS.length;
    return SPEAKER_COLORS[index];
}
