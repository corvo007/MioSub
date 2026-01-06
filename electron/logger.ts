import { app, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import util from 'util';

export interface LogEntry {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
}

class MainLogger {
  private logs: string[] = [];
  private maxLogs = 2000;
  private logFile: string | null = null;
  private isReady = false;
  private queue: string[] = [];

  constructor() {
    this.hookConsole();
  }

  init() {
    if (this.isReady) return;

    try {
      const userDataPath = app.getPath('userData');
      const logDir = path.join(userDataPath, 'logs');

      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      const date = new Date().toISOString().split('T')[0];
      this.logFile = path.join(logDir, `app-${date}.log`);
      this.isReady = true;

      // Flush queue
      if (this.queue.length > 0) {
        const content = this.queue.join('\n') + '\n';
        fs.appendFileSync(this.logFile, content);
        this.queue = [];
      }

      this.info('[Logger] Log system initialized');
      this.info(`[Logger] Log file: ${this.logFile}`);
    } catch (error) {
      console.error('Failed to initialize logger:', error);
    }
  }

  private hookConsole() {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalDebug = console.debug;

    console.log = (...args) => {
      this.processLog('INFO', args);
      originalLog.apply(console, args);
    };

    console.warn = (...args) => {
      this.processLog('WARN', args);
      originalWarn.apply(console, args);
    };

    console.error = (...args) => {
      this.processLog('ERROR', args);
      originalError.apply(console, args);
    };

    console.debug = (...args) => {
      this.processLog('DEBUG', args);
      originalDebug.apply(console, args);
    };
  }

  private processLog(level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR', args: any[]) {
    const message = args
      .map((arg) => {
        if (typeof arg === 'string') return arg;
        if (arg instanceof Error) return arg.stack || arg.message;
        return util.format(arg);
      })
      .join(' ');

    // Specific handling for [LEVEL] formatted strings to avoid double prefixes
    let cleanMessage = message;
    let finalLevel = level;

    if (message.startsWith('[DEBUG]')) {
      finalLevel = 'DEBUG';
      cleanMessage = message.substring(7).trim();
    } else if (message.startsWith('[INFO]')) {
      finalLevel = 'INFO';
      cleanMessage = message.substring(6).trim();
    } else if (message.startsWith('[WARN]')) {
      finalLevel = 'WARN';
      cleanMessage = message.substring(6).trim();
    } else if (message.startsWith('[ERROR]')) {
      finalLevel = 'ERROR';
      cleanMessage = message.substring(7).trim();
    }

    const now = new Date();
    const timestamp = now.toLocaleTimeString();
    const logLine = `[${timestamp}] [${finalLevel}] ${cleanMessage}`;
    const fullLogLine = `[${now.toISOString()}] [${finalLevel}] ${cleanMessage}`;

    // Add to memory buffer
    this.logs.push(logLine);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Send to windows
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send('new-log', logLine);
      }
    });

    // Write to file
    if (this.isReady && this.logFile) {
      try {
        fs.appendFileSync(this.logFile, fullLogLine + '\n');
      } catch (err) {
        // Ignore write errors to prevent recursion
      }
    } else {
      this.queue.push(fullLogLine);
    }
  }

  public getLogs() {
    return this.logs;
  }

  public info(message: string) {
    console.log(message);
  }
}

export const mainLogger = new MainLogger();
