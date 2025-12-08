/**
 * Download Page - Main Component (Tailwind CSS Version)
 */
import React, { useState } from 'react';
import {
  ArrowLeft,
  FileText,
  Settings,
  Download,
  Play,
  AlertCircle,
  CheckCircle,
  FolderOpen,
  RefreshCw,
  X,
} from 'lucide-react';
import { useDownload } from '../../hooks/useDownload';
import { UrlInput } from './UrlInput';
import { VideoPreview } from './VideoPreview';
import { QualitySelector } from './QualitySelector';
import { DownloadProgress } from './DownloadProgress';

interface DownloadPageProps {
  onDownloadComplete?: (videoPath: string) => void;
  onGoBack?: () => void;
  onShowLogs?: () => void;
  onShowSettings?: () => void;
}

export function DownloadPage({
  onDownloadComplete,
  onGoBack,
  onShowLogs,
  onShowSettings,
}: DownloadPageProps) {
  const {
    status,
    videoInfo,
    progress,
    outputDir,
    error,
    errorInfo,
    outputPath,
    parse,
    download,
    cancel,
    selectDir,
    reset,
    retry,
  } = useDownload();

  const [selectedFormat, setSelectedFormat] = useState<string>('');

  // Auto-select first format when video info is available
  React.useEffect(() => {
    if (videoInfo?.formats?.length && !selectedFormat) {
      setSelectedFormat(videoInfo.formats[0].formatId);
    }
  }, [videoInfo, selectedFormat]);

  const handleDownload = async () => {
    if (selectedFormat) {
      await download(selectedFormat);
    }
  };

  const handleDownloadAndContinue = async () => {
    if (selectedFormat) {
      const path = await download(selectedFormat);
      if (path && onDownloadComplete) {
        onDownloadComplete(path);
      }
    }
  };

  const getErrorIcon = () => {
    const iconMap: Record<string, string> = {
      network: '🌐',
      rate_limit: '⏳',
      geo_blocked: '🌍',
      private: '🔒',
      paid: '💰',
      login_required: '🔐',
      age_restricted: '🔞',
      unavailable: '🚫',
      unsupported: '⚠️',
      format_unavailable: '📺',
      invalid_url: '🔗',
    };
    return iconMap[errorInfo?.type || ''] || '❌';
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col p-4 md:p-8">
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col">
        {/* Header */}
        <header
          className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800 shrink-0 window-drag-region"
          style={{ WebkitAppRegion: 'drag' } as any}
        >
          <div className="flex items-center space-x-4">
            {onGoBack && (
              <button
                onClick={onGoBack}
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">视频下载</h1>
              <p className="text-xs text-slate-400">支持 YouTube 和 Bilibili 视频下载</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
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

        <div className="max-w-3xl mx-auto w-full mt-6">
          <UrlInput
            onParse={parse}
            disabled={status === 'downloading' || status === 'parsing'}
            loading={status === 'parsing'}
          />

          {/* Error Message */}
          {error && (
            <div
              className={`flex flex-col gap-3 p-4 rounded-lg mb-4 border
                            ${
                              errorInfo?.retryable
                                ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                                : 'bg-red-500/10 border-red-500/30 text-red-200'
                            }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-xl shrink-0">{getErrorIcon()}</span>
                <span className="leading-relaxed">{error}</span>
              </div>
              <div className="flex gap-2 justify-end">
                {errorInfo?.retryable && (
                  <button
                    onClick={retry}
                    className="px-3 py-1.5 bg-violet-500/20 border border-violet-500/50 rounded-md text-violet-300 text-sm transition-colors hover:bg-violet-500/30"
                  >
                    <span className="flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5" /> 重试
                    </span>
                  </button>
                )}
                <button
                  onClick={reset}
                  className="px-3 py-1.5 bg-white/5 border border-white/20 rounded-md text-white/70 text-sm transition-colors hover:bg-white/10"
                >
                  <span className="flex items-center gap-1.5">
                    <X className="w-3.5 h-3.5" /> 清除
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Video Card */}
          {videoInfo && status !== 'downloading' && status !== 'completed' && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <VideoPreview videoInfo={videoInfo} />

              <QualitySelector
                formats={videoInfo.formats}
                selectedFormat={selectedFormat}
                onSelect={setSelectedFormat}
              />

              {/* Output Directory */}
              <div className="pt-4 mb-6 border-t border-white/10">
                <label className="block text-sm text-white/60 mb-2">保存位置</label>
                <div className="flex items-center gap-3">
                  <span className="flex-1 px-3 py-2 bg-white/5 rounded-md text-white/70 text-sm truncate">
                    {outputDir}
                  </span>
                  <button
                    onClick={selectDir}
                    className="px-4 py-2 bg-transparent border border-white/20 rounded-md text-white/70 text-sm transition-colors hover:bg-white/5 hover:border-white/30"
                  >
                    <span className="flex items-center gap-1.5">
                      <FolderOpen className="w-4 h-4" /> 更改
                    </span>
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 justify-end pt-4 border-t border-white/10">
                <button
                  onClick={handleDownload}
                  className="px-6 py-3 bg-white/10 border border-white/20 rounded-lg text-white font-medium transition-colors hover:bg-white/15"
                >
                  <span className="flex items-center gap-2">
                    <Download className="w-4 h-4" /> 下载
                  </span>
                </button>
                <button
                  onClick={handleDownloadAndContinue}
                  className="px-6 py-3 bg-gradient-to-r from-violet-500 to-indigo-500 rounded-lg text-white font-medium transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-violet-500/40"
                >
                  <span className="flex items-center gap-2">
                    <Play className="w-4 h-4 fill-current" /> 下载并生成字幕
                  </span>
                </button>
              </div>
            </div>
          )}

          {status === 'downloading' && <DownloadProgress progress={progress} onCancel={cancel} />}

          {/* Success Message */}
          {status === 'completed' && outputPath && (
            <div className="text-center p-8 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl">
              <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-white mb-2">下载完成</h3>
              <p className="text-white/60 text-sm mb-6 break-all">{outputPath}</p>
              <div className="flex gap-4 justify-center flex-wrap">
                <button
                  onClick={() => window.electronAPI.showItemInFolder(outputPath)}
                  className="px-6 py-3 bg-white/10 border border-white/20 rounded-lg text-white transition-colors hover:bg-white/15"
                >
                  <span className="flex items-center gap-2">
                    <FolderOpen className="w-4 h-4" /> 打开下载目录
                  </span>
                </button>
                <button
                  onClick={reset}
                  className="px-6 py-3 bg-white/10 border border-white/20 rounded-lg text-white transition-colors hover:bg-white/15"
                >
                  下载新视频
                </button>
                {onDownloadComplete && (
                  <button
                    onClick={() => onDownloadComplete(outputPath)}
                    className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-lg text-white font-medium transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-500/40"
                  >
                    <span className="flex items-center gap-2">
                      <Play className="w-4 h-4 fill-current" /> 继续生成字幕
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
