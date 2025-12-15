/**
 * Download Progress Component - Tailwind CSS Version
 */
import React from 'react';
import { X } from 'lucide-react';
import type { DownloadProgress as Progress } from '@/types/download';

interface DownloadProgressProps {
  progress: Progress | null;
  onCancel: () => void;
}

export function DownloadProgress({ progress, onCancel }: DownloadProgressProps) {
  const getStageLabel = () => {
    if (!progress) return '准备下载中...';
    switch (progress.stage) {
      case 'video':
        return '正在下载视频画面 (1/2)...';
      case 'audio':
        return '正在下载音频声音 (2/2)...';
      case 'merging':
        return '正在合并文件...';
      default:
        return '下载中...';
    }
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <span className="text-white/80 font-medium">{getStageLabel()}</span>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 bg-transparent border border-red-500/50 rounded-md text-red-400 text-sm
                        transition-colors hover:bg-red-500/10"
        >
          <span className="flex items-center gap-1">
            <X className="w-3.5 h-3.5" /> 取消
          </span>
        </button>
      </div>

      {/* Progress Bar */}
      <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-3">
        {progress ? (
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(progress.percent, 100)}%` }}
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-r from-violet-500/50 to-indigo-500/50 rounded-full animate-pulse" />
        )}
      </div>

      {/* Stats */}
      <div className="flex justify-between text-sm text-white/50">
        {progress ? (
          <>
            <span>{progress.percent.toFixed(1)}%</span>
            <span>{progress.speed}</span>
            <span>剩余 {progress.eta}</span>
          </>
        ) : (
          <span>正在连接服务器...</span>
        )}
      </div>
    </div>
  );
}
