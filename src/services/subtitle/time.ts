/**
 * Formats seconds to HH:MM:SS,mmm
 */
export const formatTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
};

/**
 * Formats seconds to H:MM:SS or M:SS (for display, no milliseconds)
 */
export const formatDuration = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
};

/**
 * Parses HH:MM:SS,mmm or HH:MM:SS.mmm to seconds (float)
 */
export const timeToSeconds = (timeStr: string): number => {
  if (!timeStr) return 0;
  // Clean up
  const cleanStr = timeStr.replace(/[^0-9:.,]/g, '').replace('.', ',');
  const parts = cleanStr.split(':');

  let h = 0,
    m = 0,
    s = 0,
    ms = 0;

  if (parts.length === 3) {
    h = parseInt(parts[0], 10) || 0;
    m = parseInt(parts[1], 10) || 0;
    const s_parts = parts[2].split(',');
    s = parseInt(s_parts[0], 10) || 0;
    ms = parseInt((s_parts[1] || '0').padEnd(3, '0').slice(0, 3), 10) || 0;
  } else if (parts.length === 2) {
    m = parseInt(parts[0], 10) || 0;
    const s_parts = parts[1].split(',');
    s = parseInt(s_parts[0], 10) || 0;
    ms = parseInt((s_parts[1] || '0').padEnd(3, '0').slice(0, 3), 10) || 0;
  }

  return h * 3600 + m * 60 + s + ms / 1000;
};

/**
 * Normalizes timestamp to strictly HH:MM:SS,mmm format for SRT/PotPlayer compatibility.
 */
export const normalizeTimestamp = (timeStr: string, maxDuration?: number): string => {
  if (!timeStr) return '00:00:00,000';

  const cleanStr = timeStr.replace(/[^0-9:.,]/g, '').replace('.', ',');
  let parts = cleanStr.split(':');

  let secondsPart = parts.pop() || '0';
  let minutesPart = parts.pop() || '0';
  let hoursPart = parts.pop() || '0';

  let [secsStr, msStr] = secondsPart.split(',');
  if (!msStr) msStr = '000';

  let h = parseInt(hoursPart, 10) || 0;
  let m = parseInt(minutesPart, 10) || 0;
  let s = parseInt(secsStr, 10) || 0;
  let ms = parseInt(msStr.padEnd(3, '0').slice(0, 3), 10) || 0;

  m += Math.floor(s / 60);
  s = s % 60;
  h += Math.floor(m / 60);
  m = m % 60;

  // Formatting complete, now basic validation if maxDuration provided
  if (maxDuration) {
    const totalSeconds = h * 3600 + m * 60 + s + ms / 1000;
    if (totalSeconds > maxDuration + 30) {
      // If timestamp is way beyond duration (allowing 30s buffer), likely a parsing error or hallucination
      // Try to recover if it looks like hours were confused for minutes
      if (h > 0 && maxDuration < 3600) {
        // Heuristic: If video < 1 hour but we have hours, maybe shift down
        m += h * 60; // Wait, usually it's just wrong mapping.
        h = 0;
      }
    }
  }

  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
};

/**
 * Converts normalized HH:MM:SS,mmm to ASS format H:MM:SS.cc
 */
export const toAssTime = (normalizedTime: string): string => {
  const [hms, ms] = normalizedTime.split(',');
  const [h, m, s] = hms.split(':');
  const cs = ms.slice(0, 2);
  const p2 = (n: string) => n.padStart(2, '0').slice(-2);
  const hours = parseInt(h, 10);
  return `${hours}:${p2(m)}:${p2(s)}.${cs}`;
};
