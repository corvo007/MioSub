import React from 'react';
import { Languages, FileText, Book, Settings } from 'lucide-react';

interface HeaderProps {
  onShowLogs?: () => void;
  onShowGlossary?: () => void;
  onShowSettings?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onShowLogs, onShowGlossary, onShowSettings }) => {
  return (
    <header
      className="flex justify-between items-center mb-12 window-drag-region"
      style={{ WebkitAppRegion: 'drag' } as any}
    >
      <div className="flex items-center space-x-3">
        <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg shadow-indigo-500/20">
          <Languages className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            <span className="text-indigo-400">Gemini</span> Subtitle Pro
          </h1>
          <p className="text-sm text-slate-400">AI 字幕生成与翻译工具</p>
        </div>
      </div>
      <div className="flex space-x-2">
        {onShowLogs && (
          <button
            onClick={onShowLogs}
            className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors text-sm font-medium group"
            title="查看日志"
          >
            <FileText className="w-4 h-4 text-slate-400 group-hover:text-blue-400 transition-colors" />
            <span className="hidden sm:inline text-slate-300 group-hover:text-white">日志</span>
          </button>
        )}
        {onShowGlossary && (
          <button
            onClick={onShowGlossary}
            className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors text-sm font-medium group"
            title="术语表管理"
          >
            <Book className="w-4 h-4 text-slate-400 group-hover:text-indigo-400 transition-colors" />
            <span className="hidden sm:inline text-slate-300 group-hover:text-white">术语表</span>
          </button>
        )}
        {onShowSettings && (
          <button
            onClick={onShowSettings}
            className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors text-sm font-medium group"
          >
            <Settings className="w-4 h-4 text-slate-400 group-hover:text-emerald-400 transition-colors" />
            <span className="hidden sm:inline text-slate-300 group-hover:text-white">设置</span>
          </button>
        )}
      </div>
    </header>
  );
};
