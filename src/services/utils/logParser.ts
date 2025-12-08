import { LogEntry } from './logger';

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

    // Construct a rough timestamp (assuming today's date for simplicity, as logs are usually recent)
    // Note: This is for sorting purposes. The UI might display the raw time string or formatted date.
    const timestamp = `${datePrefix} ${timeStr}`;

    let level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' = 'INFO';
    if (levelStr) {
      level = levelStr.toUpperCase() as any;
    }
    // Don't infer level from message content - trust the explicit level if provided

    return {
      timestamp: timestamp, // Use the parsed timestamp string
      level,
      message: message.trim(),
      data: { source: 'backend', raw: logLine }, // Store raw log for reference
    };
  }

  // Fallback for unparseable lines
  return {
    timestamp: new Date().toLocaleString(),
    level: 'INFO',
    message: logLine,
    data: { source: 'backend', raw: logLine },
  };
}
