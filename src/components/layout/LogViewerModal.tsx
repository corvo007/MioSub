import React from 'react';
import { X, FileText, Download } from 'lucide-react';
import type { LogEntry } from '@/services/utils/logger';

interface LogViewerModalProps {
    isOpen: boolean;
    logs: LogEntry[];
    onClose: () => void;
}

/**
 * Modal component for viewing application logs
 */
export const LogViewerModal: React.FC<LogViewerModalProps> = ({
    isOpen,
    logs,
    onClose
}) => {
    if (!isOpen) return null;

    const handleExportLogs = async () => {
        if (logs.length === 0) {
            return;
        }

        // Format logs as text
        const logText = logs.map(log => {
            let line = `[${log.timestamp}] [${log.level}] ${log.message}`;
            if (log.data) {
                line += `\nData: ${JSON.stringify(log.data, null, 2)}`;
            }
            return line;
        }).join('\n\n');

        // Use Electron IPC if available (Desktop App)
        if (window.electronAPI?.saveLogsDialog) {
            try {
                const result = await window.electronAPI.saveLogsDialog(logText);
                if (result.success) {
                    console.log('Logs exported to:', result.filePath);
                } else if (!result.canceled) {
                    console.error('Failed to export logs:', result.error);
                }
            } catch (error) {
                console.error('Export logs error:', error);
            }
        } else {
            // Fallback to browser download (Web App)
            const blob = new Blob([logText], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `gemini-subtitle-pro-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
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
                        <FileText className="w-5 h-5 mr-2 text-blue-400" /> 应用日志
                    </h2>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleExportLogs}
                            disabled={logs.length === 0}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 border border-blue-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="导出日志"
                        >
                            <Download className="w-4 h-4" />
                            <span className="text-sm font-medium">导出</span>
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
                            <p>暂无日志</p>
                        </div>
                    ) : (
                        <div className="space-y-2 font-mono text-sm">
                            {logs.map((log, idx) => (
                                <div key={idx} className={`p-3 rounded-lg border ${log.level === 'ERROR' ? 'bg-red-500/10 border-red-500/30 text-red-300' :
                                    log.level === 'WARN' ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' :
                                        log.level === 'INFO' ? 'bg-blue-500/10 border-blue-500/30 text-blue-300' :
                                            'bg-slate-800/50 border-slate-700 text-slate-400'
                                    }`}>
                                    <div className="flex items-start gap-3">
                                        <span className="text-xs opacity-70 whitespace-nowrap">{log.timestamp}</span>
                                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${log.level === 'ERROR' ? 'bg-red-500 text-white' :
                                            log.level === 'WARN' ? 'bg-amber-500 text-white' :
                                                log.level === 'INFO' ? 'bg-blue-500 text-white' :
                                                    'bg-slate-600 text-slate-200'
                                            }`}>{log.level}</span>
                                        <span className="flex-1">{log.message}</span>
                                    </div>
                                    {log.data && (
                                        <pre className="mt-2 text-xs opacity-80 overflow-x-auto">{JSON.stringify(log.data, null, 2)}</pre>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
