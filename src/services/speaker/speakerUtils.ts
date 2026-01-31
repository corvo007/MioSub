import { v4 as uuidv4 } from 'uuid';

/**
 * Generates a unique speaker ID (UUID based).
 * Format: spk_${uuid}
 */
export const createSpeakerId = (): string => {
  return `spk_${uuidv4()}`;
};

/**
 * Generates a short 2-character alphanumeric ID for export styles.
 * Range: 00-ZZ (36*36 = 1296 combinations).
 * This is used to disambiguate speakers with the same name in ASS exports.
 */
export const generateShortId = (): string => {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 2; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Sanitizes a speaker name for use in ASS style names.
 * ASS style names should only contain alphanumeric, underscore, and safe Unicode chars.
 * Replaces illegal chars with underscores.
 */
export const sanitizeSpeakerForStyle = (speaker: string): string => {
  if (!speaker) return 'Unknown';
  return speaker
    .replace(/[\s,;:[\](){}\\/&]+/g, '_') // Replace whitespace and special chars with underscore
    .replace(/_+/g, '_') // Collapse multiple underscores
    .replace(/^_|_$/g, ''); // Trim leading/trailing underscores
};

/**
 * Extracts speaker name and content from a text line.
 * Format: "Speaker Name: Content"
 * Returns the separated speaker and content.
 *
 * Requirements for valid speaker extraction:
 * - Must have content after the colon (not just trailing colon)
 * - Speaker name should be reasonably short (max 30 chars)
 */
export const extractSpeakerFromText = (text: string): { speaker?: string; content: string } => {
  // Match "Speaker: Content" or "Speaker：Content" (Chinese colon)
  // Support optional space after colon
  // Require at least one non-whitespace character after the colon
  const match = text.match(/^(.+?)[:：]\s*(.+)$/s);

  if (match) {
    const potentialSpeaker = match[1]?.trim();
    const content = match[2];

    // Validate speaker name:
    // - Must not be too long (likely not a speaker name if > 30 chars)
    // - Must have actual content after the colon
    if (potentialSpeaker && potentialSpeaker.length <= 30 && content?.trim()) {
      return { speaker: potentialSpeaker, content: content };
    }
  }
  return { content: text };
};

/**
 * Serializes a speaker profile for hashing/comparison purposes.
 * Format: id|name|color
 */
export const serializeSpeakerProfile = (profile: {
  id: string;
  name: string;
  color?: string;
}): string => {
  return `${profile.id}|${profile.name}|${profile.color || ''}`;
};
