/**
 * End-to-End Progress Component
 * 详细展示端到端处理进度的组件
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('endToEnd');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const elapsed = Math.floor((now - startTime) / 1000);
  return (
    <span className="text-slate-500">
      {t('progress.elapsed', { time: formatDuration(elapsed) })}
    </span>
  );
}

/** Transcription chunk list display */
function TranscribeChunkList({ chunks }: { chunks: ChunkStatus[] }) {
  const { t } = useTranslation('endToEnd');

  // Chunk labels - using translations
  const getChunkLabel = (id: string | number): string => {
    const labelKeys: Record<string, string> = {
      decoding: 'progress.chunkLabels.decoding',
      segmenting: 'progress.chunkLabels.segmenting',
      glossary: 'progress.chunkLabels.glossary',
      diarization: 'progress.chunkLabels.diarization',
    };
    const key = labelKeys[String(id)];
    return key ? t(key) : t('progress.chunk', { id });
  };

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

  // Prep phase chunks
  const prepChunks = sortedChunks.filter((c) =>
    ['decoding', 'segmenting', 'glossary', 'diarization'].includes(String(c.id))
  );
  const prepCompleted = prepChunks.filter((c) => c.status === 'completed').length;

  // Content chunks
  const contentChunks = sortedChunks.filter(
    (c) => !['decoding', 'segmenting', 'glossary', 'diarization'].includes(String(c.id))
  );
  const contentCompleted = contentChunks.filter((c) => c.status === 'completed').length;
  const contentTotal = contentChunks.length > 0 ? contentChunks[0].total : 0;

  // Total: prep + content
  const totalCompleted = prepCompleted + contentCompleted;
  const totalCount = prepChunks.length + contentTotal;

  return (
    <div className="mt-4 pt-3 border-t border-slate-200">
      <div className="flex justify-between text-sm text-slate-400 mb-2">
        <span>{t('progress.subtitleProgress')}</span>
        <span>
          {totalCompleted}/{totalCount} {t('progress.completed')}
        </span>
      </div>
      <div className="max-h-32 overflow-y-auto space-y-1 custom-scrollbar">
        {sortedChunks.map((chunk) => (
          <div
            key={chunk.id}
            className="flex items-center justify-between text-sm py-1.5 px-2 bg-slate-50 border border-slate-100 rounded"
          >
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  chunk.status === 'completed' && 'bg-emerald-500',
                  chunk.status === 'error' && 'bg-red-500',
                  chunk.status === 'processing' && 'bg-brand-purple animate-pulse',
                  chunk.status !== 'completed' &&
                    chunk.status !== 'error' &&
                    chunk.status !== 'processing' &&
                    'bg-slate-200'
                )}
              />
              <span className="text-slate-600">{getChunkLabel(chunk.id)}</span>
            </div>
            <span className="text-slate-400 text-xs">{chunk.message || chunk.status}</span>
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

// Stage icons configuration
const stageIcons: Record<PipelineStage, React.ReactNode> = {
  idle: <Clock className="w-4 h-4" />,
  downloading: <Download className="w-4 h-4" />,
  extracting_audio: <Music2 className="w-4 h-4" />,
  transcribing: <FileText className="w-4 h-4" />,
  extracting_glossary: <FileText className="w-4 h-4" />,
  extracting_speakers: <FileText className="w-4 h-4" />,
  refining: <Languages className="w-4 h-4" />,
  translating: <Languages className="w-4 h-4" />,
  exporting_subtitle: <FileText className="w-4 h-4" />,
  compressing: <Film className="w-4 h-4" />,
  completed: <CheckCircle className="w-4 h-4" />,
  failed: <XCircle className="w-4 h-4" />,
};

// Get stage config with translations
const getStageConfig = (t: (key: string) => string) => (stage: PipelineStage) => ({
  icon: stageIcons[stage],
  label: t(`progress.stages.${stage}.label`),
  description: t(`progress.stages.${stage}.description`),
});

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
  const { t } = useTranslation('endToEnd');
  const config = getStageConfig(t)(stage);

  const statusStyles = {
    pending: 'bg-white border-slate-200 text-slate-300',
    active:
      'bg-brand-purple/10 border-brand-purple/50 text-brand-purple animate-pulse shadow-sm shadow-brand-purple/20',
    completed: 'bg-emerald-50 border-emerald-200 text-emerald-600',
    error: 'bg-red-50 border-red-200 text-red-600',
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
      <span
        className={cn(
          'mt-2 text-xs font-medium',
          isCurrent ? 'text-brand-purple font-bold' : 'text-slate-400'
        )}
      >
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
          completed ? 'bg-emerald-500/50' : 'bg-slate-200'
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
  const { t } = useTranslation('endToEnd');

  return (
    <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white/95 backdrop-blur-xl border border-white/60 rounded-2xl p-6 max-w-md mx-4 shadow-2xl ring-1 ring-slate-900/5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-amber-500" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800">
            {t('progress.cancelConfirm.title')}
          </h3>
        </div>
        <p className="text-slate-500 mb-6">{t('progress.cancelConfirm.message')}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 font-medium transition-colors"
          >
            {t('progress.cancelConfirm.continue')}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg text-red-600 font-medium transition-colors"
          >
            {t('progress.cancelConfirm.confirm')}
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

  const { t } = useTranslation('endToEnd');
  const stageConfigFn = getStageConfig(t);
  const config = stageConfigFn(uiStage);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}

      {/* Stage Timeline */}
      <div className="bg-white/50 border border-white/60 rounded-xl p-6 mb-6 shadow-sm">
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
          <span className="text-slate-500">{t('progress.overallProgress')}</span>
          <div className="flex items-center gap-4">
            {/* Elapsed Time */}
            {progress?.pipelineStartTime && <ElapsedTime startTime={progress.pipelineStartTime} />}
            <span className="text-slate-700 font-medium">
              {(progress?.overallProgress || 0).toFixed(1)}%
            </span>
          </div>
        </div>
        <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full transition-all duration-500',
              isError && 'bg-red-500',
              isCompleted && 'bg-emerald-500',
              !isError && !isCompleted && 'bg-linear-to-r from-violet-500 to-indigo-500'
            )}
            style={{ width: `${progress?.overallProgress || 0}%` }}
          />
        </div>
      </div>

      {/* Current Stage Details */}
      {!isCompleted && !isError && (
        <div className="p-4 bg-white/50 border border-white/60 rounded-xl mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-brand-purple">{config.icon}</span>
              <span className="text-slate-700 font-medium">{config.label}</span>
            </div>
            <span className="text-slate-500 text-base">
              {(progress?.stageProgress || 0).toFixed(1)}%
            </span>
          </div>

          <div className="h-2 bg-slate-200 rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-brand-purple transition-all duration-300"
              style={{ width: `${progress?.stageProgress || 0}%` }}
            />
          </div>

          {/* Stage-specific details */}
          <div className="text-sm text-slate-500">
            {/* Download details */}
            {currentStage === 'downloading' && progress?.downloadProgress && (
              <div className="flex items-center justify-between">
                <span className="truncate" title={progress.message}>
                  {progress.message}
                </span>
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
                <span>{t('progress.compressing')}</span>
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
              progress?.message && (
                <span className="truncate" title={progress.message}>
                  {progress.message}
                </span>
              )}
          </div>

          {/* Transcription chunk list (like ProgressOverlay) */}
          {progress?.transcribeProgress && progress.transcribeProgress.length > 0 && (
            <TranscribeChunkList chunks={progress.transcribeProgress} />
          )}
        </div>
      )}

      {/* Error Details */}
      {isError && progress?.message && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-red-700 mb-1">{t('progress.errorDetails')}</div>
              <div
                className="text-sm text-red-600/80 line-clamp-3 break-all"
                title={progress.message}
              >
                {progress.message}
              </div>
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
            {t('progress.retry')}
          </button>
        )}
        <button
          onClick={handleCancelClick}
          className={cn(
            'px-6 py-3 border rounded-xl font-medium transition-colors shadow-sm',
            isCompleted || isError
              ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
          )}
        >
          {isCompleted || isError ? t('progress.close') : t('progress.cancelProcessing')}
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
