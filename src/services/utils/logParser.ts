import { type LogEntry } from '@/services/utils/logger';

/**
 * Format a Date to sortable timestamp string: YYYY-MM-DD HH:mm:ss.mmm
 */
function formatTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

/**
 * Parses a backend log line into a structured LogEntry.
 * Expected format: "[Time] [Level] Message" or "[Time] Message"
 * Example: "[12:00:00] [INFO] Starting server..."
 */
export function parseBackendLog(logLine: string): LogEntry {
  const now = new Date();
  const datePrefix = now.toISOString().split('T')[0]; // YYYY-MM-DD

  // Regex to extract timestamp and optional level
  // Matches: [12:00:00] [INFO] Message OR [12:00:00] Message
  const match = logLine.match(
    /^\[(\d{1,2}:\d{2}:\d{2}(?:\s[AP]M)?)\]\s*(?:\[(INFO|WARN|ERROR|DEBUG)\])?\s*(.*)/i
  );

  if (match) {
    const [, timeStr, levelStr, message] = match;

    // Construct a sortable timestamp (assuming today's date for simplicity)
    // Format: YYYY-MM-DD HH:mm:ss (24-hour format for proper sorting)
    let timestamp = `${datePrefix} ${timeStr}`;

    // Convert 12-hour format to 24-hour if needed
    const ampmMatch = timeStr.match(/(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/i);
    if (ampmMatch) {
      let hours = parseInt(ampmMatch[1], 10);
      const mins = ampmMatch[2];
      const secs = ampmMatch[3];
      const ampm = ampmMatch[4].toUpperCase();
      if (ampm === 'PM' && hours !== 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
      timestamp = `${datePrefix} ${String(hours).padStart(2, '0')}:${mins}:${secs}`;
    }

    let level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' = 'INFO';
    if (levelStr) {
      level = levelStr.toUpperCase() as any;
    }

    return {
      timestamp,
      level,
      message: message.trim(),
      data: { source: 'backend', raw: logLine },
    };
  }

  // Fallback for unparseable lines - use sortable format
  return {
    timestamp: formatTimestamp(now),
    level: 'INFO',
    message: logLine,
    data: { source: 'backend', raw: logLine },
  };
}
