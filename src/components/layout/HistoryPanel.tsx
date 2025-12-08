import React, { useState, useEffect } from 'react';
import {
  X,
  GitCommit,
  FolderOpen,
  RotateCcw,
  Trash2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { SubtitleSnapshot, SubtitleItem } from '@/types/subtitle';

export interface WorkspaceHistory {
  id: string;
  filePath: string;
  fileName: string;
  subtitles: SubtitleItem[];
  savedAt: string;
}

interface HistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  // Snapshots (session)
  snapshots: SubtitleSnapshot[];
  onRestoreSnapshot: (snapshot: SubtitleSnapshot) => void;
  // Persistent history
  histories: WorkspaceHistory[];
  onLoadHistory: (history: WorkspaceHistory) => void;
  onDeleteHistory: (id: string) => void;
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({
  isOpen,
  onClose,
  snapshots,
  onRestoreSnapshot,
  histories,
  onLoadHistory,
  onDeleteHistory,
}) => {
  const [snapshotsExpanded, setSnapshotsExpanded] = useState(true);
  const [historiesExpanded, setHistoriesExpanded] = useState(true);
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron;

  if (!isOpen) return null;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar w-full relative">
      <button
        onClick={onClose}
        className="absolute top-2 right-4 text-slate-400 hover:text-white z-10"
      >
        <X className="w-4 h-4" />
      </button>

      <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
        <GitCommit className="w-5 h-5 text-indigo-400" />
        历史记录
      </h2>

      {/* Session Snapshots */}
      <div className="border border-slate-700 rounded-xl overflow-hidden">
        <button
          onClick={() => setSnapshotsExpanded(!snapshotsExpanded)}
          className="w-full px-4 py-3 bg-slate-800/50 flex items-center justify-between text-sm font-medium text-slate-300 hover:bg-slate-800"
        >
          <span className="flex items-center gap-2">
            {snapshotsExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            本次会话快照
            {snapshots.length > 0 && (
              <span className="text-xs text-indigo-400 bg-indigo-500/20 px-1.5 py-0.5 rounded">
                {snapshots.length}
              </span>
            )}
          </span>
        </button>
        {snapshotsExpanded && (
          <div className="p-3 space-y-2">
            {snapshots.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-sm">暂无快照</div>
            ) : (
              snapshots.map((snap) => (
                <div
                  key={snap.id}
                  className="bg-slate-800/50 border border-slate-700 p-3 rounded-lg flex justify-between items-center"
                >
                  <div>
                    <h4 className="font-medium text-slate-200 text-sm">{snap.description}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">{snap.timestamp}</p>
                  </div>
                  <button
                    onClick={() => onRestoreSnapshot(snap)}
                    className="px-2.5 py-1.5 bg-slate-700 hover:bg-indigo-600 rounded text-xs text-white transition-colors flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" /> 恢复
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Persistent History (Desktop only) */}
      {isElectron && (
        <div className="border border-slate-700 rounded-xl overflow-hidden">
          <button
            onClick={() => setHistoriesExpanded(!historiesExpanded)}
            className="w-full px-4 py-3 bg-slate-800/50 flex items-center justify-between text-sm font-medium text-slate-300 hover:bg-slate-800"
          >
            <span className="flex items-center gap-2">
              {historiesExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              历史项目
              {histories.length > 0 && (
                <span className="text-xs text-emerald-400 bg-emerald-500/20 px-1.5 py-0.5 rounded">
                  {histories.length}
                </span>
              )}
            </span>
          </button>
          {historiesExpanded && (
            <div className="p-3 space-y-2">
              {histories.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-sm">暂无历史项目</div>
              ) : (
                histories.map((history) => (
                  <div
                    key={history.id}
                    className="bg-slate-800/50 border border-slate-700 p-3 rounded-lg"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-slate-200 text-sm truncate">
                          {history.fileName}
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{history.filePath}</p>
                        <p className="text-xs text-slate-400 mt-1">
                          {history.subtitles.length} 行字幕 ·{' '}
                          {new Date(history.savedAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <button
                          onClick={() => onLoadHistory(history)}
                          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded text-xs text-white transition-colors flex items-center gap-1"
                        >
                          <FolderOpen className="w-3 h-3" /> 加载
                        </button>
                        <button
                          onClick={() => onDeleteHistory(history.id)}
                          className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
