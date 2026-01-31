import React, { useState, useEffect } from 'react';
import { logger, type LogEntry } from '@/services/utils/logger';
import { useAppStore } from '@/store/useAppStore';

export function useLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const addToast = useAppStore((s) => s.addToast);

  // Initialize settings from storage on mount (moved from App.tsx as it relates to logs/global init)
  // Actually initializeSettings is global app init, maybe leave it in App.tsx or move to a useAppInit hook?
  // User asked to move "these logic", referring specifically to logs and snapshot restore.
  // I will leave initializeSettings in App.tsx or move it if it makes sense, but strictly useLogs should concern logs.

  // 1. Frontend Logs Subscription
  useEffect(() => {
    // Initial load of logs
    setLogs(logger.getLogs());

    const unsubscribe = logger.subscribe((log) => {
      setLogs((prev) => [...prev, log]);

      // Auto-toast for errors or explicit toast request
      if (log.level === 'ERROR') {
        addToast(log.message, 'error', 5000);
      } else if (log.data?.toast) {
        const type = log.data.toastType || (log.level === 'WARN' ? 'warning' : 'info');
        addToast(log.message, type, 5000);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [addToast]);

  // 2. Backend Logs Subscription
  const initRef = React.useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    let unsubscribeBackend: (() => void) | undefined;

    const initBackendLogs = async () => {
      if (window.electronAPI && window.electronAPI.getMainLogs) {
        try {
          const historyLogs = await window.electronAPI.getMainLogs();
          logger.info(`[App] Loaded ${historyLogs.length} historical logs from backend`);

          const { parseBackendLog } = await import('@/services/utils/logParser');

          const parsedHistory = historyLogs
            .map((logItem: string | LogEntry) => {
              if (typeof logItem === 'object' && logItem !== null && 'level' in logItem) {
                return logItem as LogEntry;
              }
              if (typeof logItem === 'string') {
                try {
                  return parseBackendLog(logItem);
                } catch {
                  return null;
                }
              }
              return null;
            })
            .filter((l: LogEntry | null) => l !== null) as LogEntry[];

          setLogs((prev) => {
            const newLogs = [...prev];
            parsedHistory.forEach((pl) => {
              if (
                !newLogs.some(
                  (existing) =>
                    existing.timestamp === pl.timestamp &&
                    existing.message === pl.message &&
                    JSON.stringify(existing.data) === JSON.stringify(pl.data)
                )
              ) {
                newLogs.push(pl);
              }
            });
            // Sort by timestamp to ensure correct order
            newLogs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
            return newLogs;
          });
        } catch (err) {
          logger.error('Failed to load backend log history', err);
        }
      }
    };

    if (window.electronAPI && window.electronAPI.onNewLog) {
      initBackendLogs().catch((err) => logger.error('[App] Failed to init backend logs', err));

      unsubscribeBackend = window.electronAPI.onNewLog(async (newLog: string | LogEntry) => {
        try {
          let parsed: LogEntry;

          if (typeof newLog === 'object' && newLog !== null) {
            parsed = newLog as LogEntry;
          } else {
            const { parseBackendLog } = await import('@/services/utils/logParser');
            parsed = parseBackendLog(String(newLog));
          }

          // Sync to frontend console for developer visibility
          const prefix = `[Main]`;
          const logMsg = parsed.message;
          const logData = parsed.data;

          // Avoid logging duplicate [Renderer] logs that originated from here
          if (!logMsg.startsWith('[Renderer]')) {
            switch (parsed.level) {
              case 'ERROR':
                console.error(prefix, logMsg, logData || '');
                break;
              case 'WARN':
                console.warn(prefix, logMsg, logData || '');
                break;
              case 'INFO':
                // console.info(prefix, logMsg, logData || ''); // Optional: lessen noise
                break;
              case 'DEBUG':
                // console.debug(prefix, logMsg, logData || '');
                break;
              default:
                console.log(prefix, logMsg, logData || '');
            }
          }

          setLogs((prev) => {
            const isDuplicate = prev.some((l) => {
              if (
                l.timestamp === parsed.timestamp &&
                l.message === parsed.message &&
                JSON.stringify(l.data) === JSON.stringify(parsed.data)
              )
                return true;

              if (parsed.message.startsWith('[Renderer] ')) {
                const cleanMessage = parsed.message.replace('[Renderer] ', '');
                if (
                  l.message === cleanMessage &&
                  JSON.stringify(l.data) === JSON.stringify(parsed.data)
                ) {
                  return true;
                }
              }
              return false;
            });

            if (isDuplicate) return prev;
            return [...prev, parsed];
          });
        } catch (err) {
          logger.error('Error parsing real-time log', err);
        }
      });
    }

    return () => {
      if (unsubscribeBackend) unsubscribeBackend();
    };
  }, []);

  return logs;
}
