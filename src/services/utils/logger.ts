export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

export interface LogEntry {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  data?: any;
}

class Logger {
  private level: LogLevel = LogLevel.DEBUG;
  private logs: LogEntry[] = [];
  private listeners: ((log: LogEntry) => void)[] = [];
  private maxLogs = 1000;

  setLevel(level: LogLevel) {
    this.level = level;
  }

  subscribe(listener: (log: LogEntry) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  getLogs() {
    return this.logs;
  }

  private addLog(level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR', message: string, data?: any) {
    const now = new Date();
    const timestamp = now.toLocaleTimeString(); // Simplified for UI

    const entry: LogEntry = { timestamp, level, message, data };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    this.listeners.forEach((l) => l(entry));

    // Also log to console
    const consoleMsg = this.formatMessage(level, message, data);
    if (level === 'DEBUG') console.debug(consoleMsg);
    else if (level === 'INFO') console.info(consoleMsg);
    else if (level === 'WARN') console.warn(consoleMsg);
    else if (level === 'ERROR') console.error(consoleMsg);
  }

  private formatMessage(level: string, message: string, data?: any) {
    const now = new Date();
    // Format local time as YYYY-MM-DD HH:MM:SS with timezone
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timezoneOffset = -now.getTimezoneOffset();
    const offsetHours = Math.floor(Math.abs(timezoneOffset) / 60);
    const offsetMinutes = Math.abs(timezoneOffset) % 60;
    const offsetSign = timezoneOffset >= 0 ? '+' : '-';
    const offsetMinutesStr = offsetMinutes > 0 ? `:${String(offsetMinutes).padStart(2, '0')}` : '';
    const timestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC${offsetSign}${offsetHours}${offsetMinutesStr}`;

    // Handle circular references or large objects if needed, but simple stringify is usually ok for debug
    let dataString = '';
    if (data !== undefined) {
      try {
        dataString = `\nData: ${JSON.stringify(data, null, 2)}`;
      } catch {
        dataString = `\nData: [Circular or Non-Serializable Object]`;
      }
    }
    return `[${timestamp}] [${level}] ${message}${dataString}`;
  }

  debug(message: string, data?: any) {
    if (this.level <= LogLevel.DEBUG) {
      this.addLog('DEBUG', message, data);
    }
  }

  info(message: string, data?: any) {
    if (this.level <= LogLevel.INFO) {
      this.addLog('INFO', message, data);
    }
  }

  warn(message: string, data?: any) {
    if (this.level <= LogLevel.WARN) {
      this.addLog('WARN', message, data);
    }
  }

  error(message: string, data?: any) {
    if (this.level <= LogLevel.ERROR) {
      this.addLog('ERROR', message, data);
    }
  }
}

export const logger = new Logger();
