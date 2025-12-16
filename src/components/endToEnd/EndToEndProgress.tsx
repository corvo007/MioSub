/**
 * End-to-End Progress Component
 * 详细展示端到端处理进度的组件
 */

import React, { useState, useEffect } from 'react';
import {
  Download,
  Music2,
  FileText,
  Languages,
  Film,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  Clock,
  RefreshCw,
} from 'lucide-react';
import type { PipelineProgress, PipelineStage } from '@/types/endToEnd';
import type { ChunkStatus } from '@/types/api';

import { formatDuration } from '@/services/subtitle/time';
import { cn } from '@/lib/cn';

/** Elapsed time display component */
function ElapsedTime({ startTime }: { startTime: number }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const elapsed = Math.floor((now - startTime) / 1000);
  return <span className="text-white/40">用时: {formatDuration(elapsed)}</span>;
}

/** Chunk status labels */
const CHUNK_LABELS: Record<string, string> = {
  decoding: '解码音频',
  segmenting: '分段处理',
  glossary: '提取术语',
  diarization: '说话人分析',
};

/** Transcription chunk list display */
function TranscribeChunkList({ chunks }: { chunks: ChunkStatus[] }) {
  // Sort chunks: system tasks first, then by id
  const sortedChunks = [...chunks].sort((a, b) => {
    const systemOrder: Record<string, number> = {
      decoding: 1,
      segmenting: 2,
      glossary: 3,
      diarization: 4,
    };
    const orderA = systemOrder[String(a.id)] || 999;
    const orderB = systemOrder[String(b.id)] || 999;
    if (orderA !== orderB) return orderA - orderB;
    const idA = Number(a.id);
    const idB = Number(b.id);
    if (!isNaN(idA) && !isNaN(idB)) return idA - idB;
    return String(a.id).localeCompare(String(b.id));
  });

  // 前导环节
  const prepChunks = sortedChunks.filter((c) =>
    ['decoding', 'segmenting', 'glossary', 'diarization'].includes(String(c.id))
  );
  const prepCompleted = prepChunks.filter((c) => c.status === 'completed').length;

  // 内容片段
  const contentChunks = sortedChunks.filter(
    (c) => !['decoding', 'segmenting', 'glossary', 'diarization'].includes(String(c.id))
  );
  const contentCompleted = contentChunks.filter((c) => c.status === 'completed').length;
  const contentTotal = contentChunks.length > 0 ? contentChunks[0].total : 0;

  // 总计：前导 + 内容
  const totalCompleted = prepCompleted + contentCompleted;
  const totalCount = prepChunks.length + contentTotal;

  return (
    <div className="mt-4 pt-3 border-t border-white/10">
      <div className="flex justify-between text-sm text-white/40 mb-2">
        <span>字幕生成进度</span>
        <span>
          {totalCompleted}/{totalCount} 已完成
        </span>
      </div>
      <div className="max-h-32 overflow-y-auto space-y-1 custom-scrollbar">
        {sortedChunks.map((chunk) => (
          <div
            key={chunk.id}
            className="flex items-center justify-between text-sm py-1.5 px-2 bg-white/5 rounded"
          >
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  chunk.status === 'completed' && 'bg-emerald-500',
                  chunk.status === 'error' && 'bg-red-500',
                  chunk.status === 'processing' && 'bg-blue-500 animate-pulse',
                  chunk.status !== 'completed' &&
                    chunk.status !== 'error' &&
                    chunk.status !== 'processing' &&
                    'bg-white/20'
                )}
              />
              <span className="text-white/60">
                {CHUNK_LABELS[String(chunk.id)] || `片段 ${chunk.id}`}
              </span>
            </div>
            <span className="text-white/40 text-xs">{chunk.message || chunk.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface EndToEndProgressProps {
  progress: PipelineProgress | null;
  onAbort: () => void;
  onRetry?: () => void;
}

// Stage configuration with icons and labels
const stageConfig: Record<
  PipelineStage,
  { icon: React.ReactNode; label: string; description: string }
> = {
  idle: {
    icon: <Clock className="w-4 h-4" />,
    label: '准备中',
    description: '初始化任务...',
  },
  downloading: {
    icon: <Download className="w-4 h-4" />,
    label: '下载视频',
    description: '正在从网络下载视频文件',
  },
  extracting_audio: {
    icon: <Music2 className="w-4 h-4" />,
    label: '提取音频',
    description: '从视频中提取音频流',
  },
  transcribing: {
    icon: <FileText className="w-4 h-4" />,
    label: '生成字幕',
    description: 'AI 转录与翻译',
  },
  extracting_glossary: {
    icon: <FileText className="w-4 h-4" />,
    label: '提取术语',
    description: '生成专有词汇表',
  },
  extracting_speakers: {
    icon: <FileText className="w-4 h-4" />,
    label: '说话人分析',
    description: '识别音频中的说话人',
  },
  refining: {
    icon: <Languages className="w-4 h-4" />,
    label: '润色校对',
    description: '校对并润色字幕内容',
  },
  translating: {
    icon: <Languages className="w-4 h-4" />,
    label: '翻译字幕',
    description: '翻译字幕内容',
  },
  exporting_subtitle: {
    icon: <FileText className="w-4 h-4" />,
    label: '导出字幕',
    description: '将字幕导出为文件',
  },
  compressing: {
    icon: <Film className="w-4 h-4" />,
    label: '压制视频',
    description: '压缩视频并嵌入字幕',
  },
  completed: {
    icon: <CheckCircle className="w-4 h-4" />,
    label: '完成',
    description: '所有处理已完成',
  },
  failed: {
    icon: <XCircle className="w-4 h-4" />,
    label: '失败',
    description: '处理过程中发生错误',
  },
};

// Processing stages in order (excluding terminal states) - simplified for UI
const processingStages: PipelineStage[] = [
  'downloading',
  'extracting_audio',
  'transcribing',
  // 'translating', // Merged into transcribing
  'compressing',
];

/** Stage status indicator */
function StageIndicator({
  stage,
  status,
  isCurrent,
}: {
  stage: PipelineStage;
  status: 'pending' | 'active' | 'completed' | 'error';
  isCurrent: boolean;
}) {
  const config = stageConfig[stage];

  const statusStyles = {
    pending: 'bg-white/5 border-white/10 text-white/40',
    active: 'bg-blue-500/20 border-blue-500/50 text-blue-400 animate-pulse',
    completed: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400',
    error: 'bg-red-500/20 border-red-500/50 text-red-400',
  };

  return (
    <div className="flex flex-col items-center">
      <div
        className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all',
          statusStyles[status]
        )}
      >
        {status === 'active' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : status === 'completed' ? (
          <CheckCircle className="w-4 h-4" />
        ) : status === 'error' ? (
          <XCircle className="w-4 h-4" />
        ) : (
          config.icon
        )}
      </div>
      <span className={cn('mt-2 text-xs font-medium', isCurrent ? 'text-white' : 'text-white/50')}>
        {config.label}
      </span>
    </div>
  );
}

/** Connection line between stages */
function StageConnector({ completed }: { completed: boolean }) {
  return (
    <div className="flex-1 h-0.5 mx-2 mt-5">
      <div
        className={cn(
          'h-full rounded transition-colors',
          completed ? 'bg-emerald-500/50' : 'bg-white/10'
        )}
      />
    </div>
  );
}

/** Cancel confirmation dialog */
function CancelConfirmDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md mx-4 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-amber-400" />
          </div>
          <h3 className="text-lg font-semibold text-white">确认取消</h3>
        </div>
        <p className="text-slate-400 mb-6">
          确定要取消当前处理吗？已完成的中间文件将被保留在临时目录中。
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-white font-medium transition-colors"
          >
            继续处理
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-red-300 font-medium transition-colors"
          >
            确认取消
          </button>
        </div>
      </div>
    </div>
  );
}

/** Main progress component */
export function EndToEndProgress({ progress, onAbort, onRetry }: EndToEndProgressProps) {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const currentStage = progress?.stage || 'idle';

  // Map diverse generation stages to the unified 'transcribing' UI stage
  const getUiStage = (stage: PipelineStage): PipelineStage => {
    switch (stage) {
      case 'extracting_glossary':
      case 'extracting_speakers':
      case 'refining':
      case 'translating':
      case 'exporting_subtitle':
        return 'transcribing'; // All these are part of "Generation"
      default:
        return stage;
    }
  };

  const uiStage = getUiStage(currentStage);
  const currentStageIndex = processingStages.indexOf(uiStage);

  const isError = currentStage === 'failed';
  const isCompleted = currentStage === 'completed';

  // Determine status for each stage
  const getStageStatus = (stage: PipelineStage): 'pending' | 'active' | 'completed' | 'error' => {
    const stageIndex = processingStages.indexOf(stage);
    if (isError && stage === uiStage) return 'error'; // Use mapped UI stage for error check
    if (stageIndex < currentStageIndex) return 'completed';
    if (stageIndex === currentStageIndex) return 'active';
    // Special case: if completed, everything is completed
    if (isCompleted) return 'completed';
    return 'pending';
  };

  const handleCancelClick = () => {
    if (isCompleted || isError) {
      onAbort();
    } else {
      setShowCancelConfirm(true);
    }
  };

  const handleConfirmCancel = () => {
    setShowCancelConfirm(false);
    onAbort();
  };

  const config = stageConfig[uiStage] || stageConfig.idle;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <div
          className={cn(
            'inline-flex items-center justify-center w-16 h-16 rounded-2xl border mb-4',
            isError && 'bg-gradient-to-br from-red-500/20 to-orange-500/20 border-red-500/30',
            isCompleted &&
              'bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border-emerald-500/30',
            !isError &&
              !isCompleted &&
              'bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border-blue-500/30'
          )}
        >
          {isError ? (
            <XCircle className="w-8 h-8 text-red-400" />
          ) : isCompleted ? (
            <CheckCircle className="w-8 h-8 text-emerald-400" />
          ) : (
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          )}
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">
          {isError ? '处理失败' : isCompleted ? '处理完成' : '正在处理'}
        </h2>
        <p className="text-white/60">{progress?.message || config.description}</p>
      </div>

      {/* Stage Timeline */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between">
          {processingStages.map((stage, index) => (
            <React.Fragment key={stage}>
              <StageIndicator
                stage={stage}
                status={getStageStatus(stage)}
                isCurrent={stage === currentStage}
              />
              {index < processingStages.length - 1 && (
                <StageConnector completed={processingStages.indexOf(stage) < currentStageIndex} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Overall Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between text-base mb-2">
          <span className="text-white/60">总进度</span>
          <div className="flex items-center gap-4">
            {/* Elapsed Time */}
            {progress?.pipelineStartTime && <ElapsedTime startTime={progress.pipelineStartTime} />}
            <span className="text-white font-medium">
              {(progress?.overallProgress || 0).toFixed(1)}%
            </span>
          </div>
        </div>
        <div className="h-3 bg-white/10 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full transition-all duration-500',
              isError && 'bg-red-500',
              isCompleted && 'bg-emerald-500',
              !isError && !isCompleted && 'bg-gradient-to-r from-violet-500 to-indigo-500'
            )}
            style={{ width: `${progress?.overallProgress || 0}%` }}
          />
        </div>
      </div>

      {/* Current Stage Details */}
      {!isCompleted && !isError && (
        <div className="p-4 bg-white/5 border border-white/10 rounded-xl mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-blue-400">{config.icon}</span>
              <span className="text-white font-medium">{config.label}</span>
            </div>
            <span className="text-white/60 text-base">
              {(progress?.stageProgress || 0).toFixed(1)}%
            </span>
          </div>

          <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progress?.stageProgress || 0}%` }}
            />
          </div>

          {/* Stage-specific details */}
          <div className="text-sm text-white/50">
            {/* Download details */}
            {currentStage === 'downloading' && progress?.downloadProgress && (
              <div className="flex items-center justify-between">
                <span>{progress.message}</span>
                <div className="flex items-center gap-4">
                  {progress.downloadProgress.eta && (
                    <span>ETA: {progress.downloadProgress.eta}</span>
                  )}
                </div>
              </div>
            )}

            {/* Compression details */}
            {currentStage === 'compressing' && progress?.compressProgress && (
              <div className="flex items-center justify-between">
                <span>正在压制视频...</span>
                <div className="flex items-center gap-4">
                  {progress.compressProgress.currentFps > 0 && (
                    <span>{progress.compressProgress.currentFps.toFixed(1)} fps</span>
                  )}
                  {progress.compressProgress.currentKbps > 0 && (
                    <span>{progress.compressProgress.currentKbps.toFixed(0)} kbps</span>
                  )}
                  {progress.compressProgress.timemark && (
                    <span>{progress.compressProgress.timemark}</span>
                  )}
                </div>
              </div>
            )}

            {/* Default message */}
            {currentStage !== 'downloading' &&
              currentStage !== 'compressing' &&
              progress?.message && <span>{progress.message}</span>}
          </div>

          {/* Transcription chunk list (like ProgressOverlay) */}
          {progress?.transcribeProgress && progress.transcribeProgress.length > 0 && (
            <TranscribeChunkList chunks={progress.transcribeProgress} />
          )}
        </div>
      )}

      {/* Error Details */}
      {isError && progress?.message && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-red-300 mb-1">错误详情</div>
              <div className="text-sm text-red-200/70">{progress.message}</div>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-center gap-4">
        {isError && onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-2 px-6 py-3 bg-violet-500/20 border border-violet-500/30 rounded-xl text-violet-300 font-medium transition-colors hover:bg-violet-500/30"
          >
            <RefreshCw className="w-4 h-4" />
            重试
          </button>
        )}
        <button
          onClick={handleCancelClick}
          className={cn(
            'px-6 py-3 border rounded-xl font-medium transition-colors',
            isCompleted || isError
              ? 'bg-slate-800 border-slate-700 text-white hover:bg-slate-700'
              : 'bg-red-500/20 border-red-500/30 text-red-300 hover:bg-red-500/30'
          )}
        >
          {isCompleted || isError ? '关闭' : '取消处理'}
        </button>
      </div>

      {/* Cancel Confirmation Dialog */}
      {showCancelConfirm && (
        <CancelConfirmDialog
          onConfirm={handleConfirmCancel}
          onCancel={() => setShowCancelConfirm(false)}
        />
      )}
    </div>
  );
}
