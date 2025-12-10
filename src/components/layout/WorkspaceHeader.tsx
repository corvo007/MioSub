import React from 'react';
import { ArrowLeft, GitCommit, FileText, Book, Settings } from 'lucide-react';

interface WorkspaceHeaderProps {
  title: string;
  modeLabel: string;
  subtitleInfo: string;
  onBack: () => void;
  showSnapshots: boolean;
  onToggleSnapshots: () => void;
  hasSnapshots: boolean;
  onShowLogs: () => void;
  onShowGlossary: () => void;
  onShowSettings: () => void;
}

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  title,
  modeLabel,
  subtitleInfo,
  onBack,
  showSnapshots,
  onToggleSnapshots,
  hasSnapshots,
  onShowLogs,
  onShowGlossary,
  onShowSettings,
}) => {
  return (
    <header
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 pb-3 sm:pb-4 border-b border-slate-800 shrink-0 window-drag-region"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      <div className="flex items-center space-x-3 sm:space-x-4 min-w-0">
        <button
          onClick={onBack}
          className="p-1.5 sm:p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white flex-shrink-0"
        >
          <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2 flex-wrap">
            <span className="truncate">{title}</span>
            <span className="text-[10px] sm:text-xs font-normal text-slate-500 bg-slate-900 border border-slate-800 px-1.5 sm:px-2 py-0.5 rounded whitespace-nowrap">
              {modeLabel}
            </span>
          </h1>
          <p className="text-xs text-slate-400 truncate max-w-[200px] sm:max-w-[300px]">
            {subtitleInfo}
          </p>
        </div>
      </div>
      <div className="flex items-center space-x-1.5 sm:space-x-2 flex-shrink-0">
        <button
          onClick={onToggleSnapshots}
          className={`flex items-center space-x-1.5 sm:space-x-2 px-2 sm:px-4 py-1.5 sm:py-2 border rounded-lg transition-colors text-xs sm:text-sm font-medium ${
            hasSnapshots
              ? 'bg-indigo-900/30 border-indigo-500/50 text-indigo-200'
              : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
          }`}
          title="历史记录"
        >
          <GitCommit className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span className="hidden sm:inline">历史</span>
        </button>
        <button
          onClick={onShowLogs}
          className="flex items-center space-x-1.5 sm:space-x-2 px-2 sm:px-4 py-1.5 sm:py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors text-xs sm:text-sm font-medium group"
          title="查看日志"
        >
          <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 group-hover:text-blue-400 transition-colors" />
          <span className="hidden sm:inline text-slate-300 group-hover:text-white">日志</span>
        </button>
        <button
          onClick={onShowGlossary}
          className="flex items-center space-x-1.5 sm:space-x-2 px-2 sm:px-4 py-1.5 sm:py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors text-xs sm:text-sm font-medium group"
          title="术语表管理"
        >
          <Book className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 group-hover:text-indigo-400 transition-colors" />
          <span className="hidden sm:inline text-slate-300 group-hover:text-white">术语表</span>
        </button>
        <button
          onClick={onShowSettings}
          className="flex items-center space-x-1.5 sm:space-x-2 px-2 sm:px-4 py-1.5 sm:py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors text-xs sm:text-sm font-medium group"
        >
          <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 group-hover:text-emerald-400 transition-colors" />
          <span className="hidden sm:inline text-slate-300 group-hover:text-white">设置</span>
        </button>
      </div>
    </header>
  );
};
