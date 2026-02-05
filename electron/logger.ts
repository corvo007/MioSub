import { BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { getLogDir } from './utils/paths.ts';
import util from 'util';
import os from 'os';

export interface LogEntry {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  data?: any;
}

class MainLogger {
  private logs: LogEntry[] = [];
  private maxLogs = 2000;
  private logFile: string | null = null;
  private isReady = false;
  private queue: string[] = [];
  private isProcessing = false; // Recursion guard for Sentry instrumentation

  constructor() {
    this.hookConsole();
  }

  init() {
    if (this.isReady) return;

    try {
      const logDir = getLogDir();

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
      // Don't double-log things we just printed in processLog if processLog calls debug,
      // but here processLog is internal.
      this.processLog('DEBUG', args);
      originalDebug.apply(console, args);
    };
  }

  /*
   * Helper to inspect arguments and extract a primary "data" object if present.
   * separation of message text and structured data.
   */
  private parseArgs(args: any[]): { cleanMessage: string; fullMessage: string; data?: any } {
    if (args.length === 0) return { cleanMessage: '', fullMessage: '', data: undefined };

    // 1. Identify Data Object
    let data: any = undefined;
    let messageArgs = [...args];

    // Heuristic: If we have > 1 arg and the last one is an object/array, treat as data
    if (args.length > 1) {
      const lastArg = args[args.length - 1];
      if (typeof lastArg === 'object' && lastArg !== null) {
        data = lastArg;
        messageArgs.pop(); // Remove data from message args
      }
    } else if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
      data = args[0];
      messageArgs = []; // Message is empty, data is the object
    }

    // 2. Build Strings
    const cleanMessage = messageArgs
      .map((arg) => {
        if (typeof arg === 'string') return arg;
        if (arg instanceof Error) return arg.stack || arg.message;
        return util.format(arg);
      })
      .join(' ');

    const fullMessage = args
      .map((arg) => {
        if (typeof arg === 'string') return arg;
        if (arg instanceof Error) return arg.stack || arg.message;
        return util.format(arg);
      })
      .join(' ');

    return { cleanMessage, fullMessage, data };
  }

  private processLog(level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR', args: any[]) {
    // Recursion guard: Sentry's prepareStackTraceCallback can trigger console.error
    // when we access Error.stack, causing infinite recursion
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const { cleanMessage, fullMessage, data } = this.parseArgs(args);

      // Filter [Level] prefixes from the clean message for UI
      let uiMessage = cleanMessage;
      let finalLevel = level;

      if (uiMessage.startsWith('[DEBUG]')) {
        finalLevel = 'DEBUG';
        uiMessage = uiMessage.substring(7).trim();
      } else if (uiMessage.startsWith('[INFO]')) {
        finalLevel = 'INFO';
        uiMessage = uiMessage.substring(6).trim();
      } else if (uiMessage.startsWith('[WARN]')) {
        finalLevel = 'WARN';
        uiMessage = uiMessage.substring(6).trim();
      } else if (uiMessage.startsWith('[ERROR]')) {
        finalLevel = 'ERROR';
        uiMessage = uiMessage.substring(7).trim();
      }

      const now = new Date();
      // Manual formatting to match local time preference: YYYY-MM-DD HH:mm:ss.SSS
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const milliseconds = String(now.getMilliseconds()).padStart(3, '0');

      // Check timezone offset handling if strictly needed, but local system time is usually desired for desktop apps
      const timestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;

      // 1. Structured Entry for UI
      const logEntry: LogEntry = {
        timestamp: timestamp,
        level: finalLevel,
        message: uiMessage,
        data,
      };

      // 2. String Entry for File
      // Ensure no double spacing by trimming the message part.
      const fullLogLine = `[${timestamp}] [${finalLevel}] ${fullMessage.trimEnd()}`;

      // Add to memory buffer
      this.logs.push(logEntry);
      if (this.logs.length > this.maxLogs) {
        this.logs.shift();
      }

      // Send to windows (Structured!)
      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
          win.webContents.send('new-log', logEntry);
        }
      });

      // Write to file (String!)
      if (this.isReady && this.logFile) {
        try {
          fs.appendFileSync(this.logFile, fullLogLine + os.EOL);
        } catch (_err) {
          // Ignore write errors
        }
      } else {
        this.queue.push(fullLogLine);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  public getLogs() {
    return this.logs;
  }

  public info(message: string) {
    console.log(message);
  }

  // Direct access to log structured data without sticking it in console.log string flow primarily
  public log(level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR', message: string, data?: any) {
    // We can call processLog directly.
    // But we also want it to appear in the terminal via console.log?
    // If we call console.log, it calls processLog.
    // So let's just call console.log with them separate?
    // console.log(message, data) -> processLog via hook.

    switch (level) {
      case 'DEBUG':
        console.debug(message, data);
        break;
      case 'INFO':
        console.log(message, data);
        break;
      case 'WARN':
        console.warn(message, data);
        break;
      case 'ERROR':
        console.error(message, data);
        break;
    }
  }
}

export const mainLogger = new MainLogger();
