import React, { useState, useMemo } from 'react';
import { X, FileText, Download, Filter } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { logger, type LogEntry } from '@/services/utils/logger';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { cn } from '@/lib/cn';
import JsonView from '@uiw/react-json-view';
import { vscodeTheme } from '@uiw/react-json-view/vscode';

interface LogViewerModalProps {
  isOpen: boolean;
  logs: LogEntry[];
  onClose: () => void;
}

type LogLevel = 'ALL' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const LOG_LEVELS: LogLevel[] = ['ALL', 'DEBUG', 'INFO', 'WARN', 'ERROR'];

/**
 * Modal component for viewing application logs
 */
export const LogViewerModal: React.FC<LogViewerModalProps> = ({ isOpen, logs, onClose }) => {
  const { t } = useTranslation('ui');
  const [filterLevel, setFilterLevel] = useState<LogLevel>('ALL');

  // Filter logs based on minimum level
  const filteredLogs = useMemo(() => {
    if (filterLevel === 'ALL') return logs;

    const levelPriority: Record<string, number> = {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3,
    };

    const minPriority = levelPriority[filterLevel] ?? 0;

    return logs.filter((log) => {
      const logPriority = levelPriority[log.level] ?? 0;
      const hasMessage = log.message && log.message.trim().length > 0;
      return logPriority >= minPriority && hasMessage;
    });
  }, [logs, filterLevel]);

  if (!isOpen) return null;

  const handleExportLogs = async () => {
    if (logs.length === 0) {
      return;
    }

    // Format logs as text
    const logText = logs
      .map((log) => {
        let line = `[${log.timestamp}] [${log.level}] ${log.message}`;
        if (log.data) {
          line += `\nData: ${JSON.stringify(log.data, null, 2)}`;
        }
        return line;
      })
      .join('\n');

    // Use Electron IPC if available (Desktop App)
    if (window.electronAPI?.saveLogsDialog) {
      try {
        const result = await window.electronAPI.saveLogsDialog(logText);
        if (result.success) {
          logger.info(`Logs exported to: ${result.filePath}`);
        } else if (!result.canceled) {
          logger.error('Failed to export logs', result.error);
        }
      } catch (error: any) {
        logger.error('Export logs error', error);
      }
    } else {
      // Fallback to browser download (Web App)
      const blob = new Blob([logText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      // Generate local timestamp for filename
      const now = new Date();
      const localTimestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}-${String(now.getMilliseconds()).padStart(3, '0')}Z`;
      link.download = `gemini-subtitle-pro-logs-${localTimestamp}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl animate-fade-in relative">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white flex items-center">
            <FileText className="w-5 h-5 mr-2 text-blue-400" /> {t('logs.title')}
          </h2>
          <div className="flex items-center gap-2">
            {/* Log Level Filter */}
            <CustomSelect
              value={filterLevel}
              onChange={(value) => setFilterLevel(value as LogLevel)}
              options={LOG_LEVELS.map((level) => ({
                value: level,
                label: level === 'ALL' ? t('logs.filterAll') : level,
              }))}
              icon={<Filter className="w-4 h-4" />}
              className="w-40"
            />
            <button
              onClick={handleExportLogs}
              disabled={logs.length === 0}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 border border-blue-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={t('logs.exportAll')}
            >
              <Download className="w-4 h-4" />
              <span className="text-sm font-medium">{t('logs.export')}</span>
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {logs.length === 0 ? (
            <div className="text-center text-slate-500 py-12">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{t('logs.empty')}</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center text-slate-500 py-12">
              <Filter className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{t('logs.emptyLevel')}</p>
            </div>
          ) : (
            <div className="space-y-1 font-mono text-sm">
              {filteredLogs.map((log, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'p-2 rounded-lg border',
                    log.level === 'ERROR' && 'bg-red-500/10 border-red-500/30 text-red-300',
                    log.level === 'WARN' && 'bg-amber-500/10 border-amber-500/30 text-amber-300',
                    log.level === 'INFO' && 'bg-blue-500/10 border-blue-500/30 text-blue-300',
                    log.level !== 'ERROR' &&
                      log.level !== 'WARN' &&
                      log.level !== 'INFO' &&
                      'bg-slate-800/50 border-slate-700 text-slate-400'
                  )}
                >
                  <div className="flex flex-col gap-1 w-full min-w-0">
                    <div className="flex items-start gap-2">
                      <span className="text-xs opacity-70 whitespace-nowrap">{log.timestamp}</span>
                      <span
                        className={cn(
                          'text-xs font-bold px-1.5 py-0.5 rounded',
                          log.level === 'ERROR' && 'bg-red-500 text-white',
                          log.level === 'WARN' && 'bg-amber-500 text-white',
                          log.level === 'INFO' && 'bg-blue-500 text-white',
                          log.level !== 'ERROR' &&
                            log.level !== 'WARN' &&
                            log.level !== 'INFO' &&
                            'bg-slate-600 text-slate-200'
                        )}
                      >
                        {log.level}
                      </span>
                      <span className="flex-1 break-all whitespace-pre-wrap">{log.message}</span>
                    </div>
                    {log.data &&
                      (() => {
                        let dataToShow = log.data;
                        // Filter out raw/source fields from objects
                        if (
                          typeof log.data === 'object' &&
                          log.data !== null &&
                          !Array.isArray(log.data)
                        ) {
                          const { raw, source, ...rest } = log.data;
                          if (Object.keys(rest).length === 0) return null;
                          dataToShow = rest;
                        }

                        // For primitives (string, number, boolean), display inline
                        if (
                          typeof dataToShow === 'string' ||
                          typeof dataToShow === 'number' ||
                          typeof dataToShow === 'boolean'
                        ) {
                          return (
                            <span className="text-xs text-emerald-400 font-mono ml-1">
                              {JSON.stringify(dataToShow)}
                            </span>
                          );
                        }

                        // For objects/arrays, use JsonView
                        // collapsed={1} expands the first level, allowing users to see the content immediately
                        return (
                          <div className="text-xs pl-24 font-mono">
                            <JsonView
                              value={dataToShow}
                              style={{ ...vscodeTheme, backgroundColor: 'transparent' }}
                              collapsed={1}
                              displayDataTypes={false}
                            />
                          </div>
                        );
                      })()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
