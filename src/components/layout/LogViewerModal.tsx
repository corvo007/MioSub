import React, { useState, useMemo } from 'react';
import { X, FileText, Download, Filter } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { logger, type LogEntry } from '@/services/utils/logger';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { cn } from '@/lib/cn';
import JsonView from '@uiw/react-json-view';

const customTheme = {
  '--w-rjv-color-string': '#059669', // Emerald 600
  '--w-rjv-color-number': '#d97706', // Amber 600
  '--w-rjv-color-boolean': '#2563eb', // Blue 600
  '--w-rjv-color-null': '#dc2626', // Red 600
  '--w-rjv-color-property': '#475569', // Slate 600
  '--w-rjv-background-color': 'transparent',
  '--w-rjv-line-color': '#e2e8f0', // Slate 200
  '--w-rjv-arrow-color': '#94a3b8', // Slate 400
  '--w-rjv-edit-color': '#475569',
  '--w-rjv-info-color': '#94a3b8',
  '--w-rjv-update-color': '#f59e0b',
  '--w-rjv-copied-color': '#059669',
  '--w-rjv-copied-success-color': '#28a745',
  '--w-rjv-curl-color': '#94a3b8', // Slate 400
  '--w-rjv-ellipsis-color': '#f59e0b',
  backgroundColor: 'transparent',
  fontSize: '11px',
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
} as React.CSSProperties;

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
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white/95 backdrop-blur-xl border border-white/60 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl shadow-brand-purple/20 relative overflow-hidden ring-1 ring-slate-900/5">
        <div className="absolute inset-0 bg-warm-mesh opacity-30 pointer-events-none" />
        <div className="p-6 border-b border-slate-200/60 flex items-center justify-between relative z-10 bg-white/50">
          <h2 className="text-xl font-bold text-slate-800 flex items-center tracking-tight">
            <div className="p-2 bg-brand-purple/10 rounded-lg mr-3">
              <FileText className="w-5 h-5 text-brand-purple" />
            </div>
            {t('logs.title')}
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
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-brand-purple/10 hover:bg-brand-purple/20 text-brand-purple font-medium border border-brand-purple/20 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              title={t('logs.exportAll')}
            >
              <Download className="w-4 h-4" />
              <span className="text-sm">{t('logs.export')}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar relative z-10 bg-slate-50/50">
          {logs.length === 0 ? (
            <div className="text-center text-slate-500 py-12">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-slate-400" />
              </div>
              <p className="font-medium text-slate-600">{t('logs.empty')}</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center text-slate-500 py-12">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Filter className="w-8 h-8 text-slate-400" />
              </div>
              <p className="font-medium text-slate-600">{t('logs.emptyLevel')}</p>
            </div>
          ) : (
            <div className="space-y-2 font-mono text-sm">
              {filteredLogs.map((log, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'p-3 rounded-xl border shadow-sm transition-colors',
                    log.level === 'ERROR' && 'bg-red-50 border-red-200/60 text-red-700',
                    log.level === 'WARN' && 'bg-amber-50 border-amber-200/60 text-amber-700',
                    log.level === 'INFO' && 'bg-white border-slate-200 text-slate-600',
                    log.level !== 'ERROR' &&
                      log.level !== 'WARN' &&
                      log.level !== 'INFO' &&
                      'bg-slate-50 border-slate-200 text-slate-500'
                  )}
                >
                  <div className="flex flex-col gap-1 w-full min-w-0">
                    <div className="flex items-start gap-3">
                      <span className="text-xs font-medium opacity-60 mt-1 font-sans">
                        {log.timestamp}
                      </span>
                      <span
                        className={cn(
                          'text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider',
                          log.level === 'ERROR' && 'bg-red-100 text-red-700 border border-red-200',
                          log.level === 'WARN' &&
                            'bg-amber-100 text-amber-700 border border-amber-200',
                          log.level === 'INFO' &&
                            'bg-blue-100 text-blue-700 border border-blue-200',
                          log.level !== 'ERROR' &&
                            log.level !== 'WARN' &&
                            log.level !== 'INFO' &&
                            'bg-slate-200 text-slate-600 border border-slate-300'
                        )}
                      >
                        {log.level}
                      </span>
                      <span className="flex-1 break-all whitespace-pre-wrap leading-relaxed">
                        {log.message}
                      </span>
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
                          const { raw: _raw, source: _source, ...rest } = log.data;
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
                              style={customTheme}
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
