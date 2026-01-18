import React from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Sparkles, CheckCircle, FileText, StopCircle } from 'lucide-react';
import { GenerationStatus, type ChunkStatus } from '@/types/api';
import { TimeTracker } from '@/components/ui/TimeTracker';
import { cn } from '@/lib/cn';

interface ProgressOverlayProps {
  isProcessing: boolean;
  chunkProgress: Record<string | number, ChunkStatus>;
  status: GenerationStatus;
  startTime: number;
  onShowLogs?: () => void;
  onCancel?: () => void;
}

export const ProgressOverlay: React.FC<ProgressOverlayProps> = ({
  isProcessing,
  chunkProgress,
  status,
  startTime,
  onShowLogs,
  onCancel,
}) => {
  const { t } = useTranslation('progress');
  if (!isProcessing) return null;

  const chunks = (Object.values(chunkProgress) as ChunkStatus[]).sort((a, b) => {
    // Prioritize system tasks (init first, then others)
    const systemOrder = { init: 0, decoding: 1, segmenting: 2, glossary: 3, diarization: 4 };
    const orderA = systemOrder[a.id as keyof typeof systemOrder] ?? 999;
    const orderB = systemOrder[b.id as keyof typeof systemOrder] ?? 999;

    if (orderA !== orderB) return orderA - orderB;

    const idA = Number(a.id);
    const idB = Number(b.id);
    if (!isNaN(idA) && !isNaN(idB)) return idA - idB;
    return String(a.id).localeCompare(String(b.id));
  });

  const systemChunks = chunks.filter((c) =>
    ['init', 'decoding', 'segmenting', 'glossary', 'diarization'].includes(String(c.id))
  );
  const contentChunks = chunks.filter(
    (c) => !['init', 'decoding', 'segmenting', 'glossary', 'diarization'].includes(String(c.id))
  );

  const contentTotal = contentChunks.length > 0 ? contentChunks[0].total : 0;
  const contentCompleted = contentChunks.filter((c) => c.status === 'completed').length;

  const systemTotal = systemChunks.length;
  const systemCompleted = systemChunks.filter((c) => c.status === 'completed').length;

  const total = contentTotal + systemTotal;
  const completed = contentCompleted + systemCompleted;

  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white/95 backdrop-blur-xl border border-white/60 rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl shadow-brand-purple/20 animate-in fade-in zoom-in duration-200 ring-1 ring-slate-900/5">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-slate-800 flex items-center">
            {status === GenerationStatus.CANCELLED ? (
              <>
                <StopCircle className="w-5 h-5 mr-2 text-orange-400" />
                {t('status.cancelled')}
              </>
            ) : status === GenerationStatus.PROOFREADING ? (
              <>
                <Sparkles className="w-5 h-5 mr-2 text-purple-400 animate-pulse" />
                {t('status.proofreading')}
              </>
            ) : (
              <>
                <Loader2 className="w-5 h-5 mr-2 text-blue-400 animate-spin" />
                {t('status.generating')}
              </>
            )}
          </h3>
          <div className="flex items-center gap-4">
            {onCancel && (
              <button
                onClick={onCancel}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 border border-red-200 transition-colors"
                title={t('tooltips.terminate')}
              >
                <StopCircle className="w-4 h-4" />
                <span className="text-sm font-medium">{t('actions.terminate')}</span>
              </button>
            )}
            {onShowLogs && (
              <button
                onClick={onShowLogs}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-brand-purple hover:text-indigo-700 border border-indigo-200 transition-colors"
                title={t('tooltips.viewLogs')}
              >
                <FileText className="w-4 h-4" />
                <span className="text-sm font-medium">{t('actions.viewLogs')}</span>
              </button>
            )}
            <span className="text-2xl font-bold text-brand-purple">{percent}%</span>
          </div>
        </div>

        {startTime && (
          <TimeTracker startTime={startTime} completed={completed} total={total} status={status} />
        )}

        <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar bg-slate-50/50 p-4 rounded-xl border border-slate-200/60 shadow-inner">
          {chunks.length === 0 && (
            <div className="text-center text-slate-500 py-8">{t('status.preparing')}</div>
          )}
          {chunks.map((chunk) => (
            <div
              key={chunk.id}
              className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200 shadow-sm hover:border-brand-purple/30 transition-colors"
            >
              <div className="flex items-center space-x-3 min-w-30">
                <div
                  className={cn(
                    'w-2 h-2 rounded-full',
                    chunk.status === 'completed' && 'bg-emerald-500',
                    chunk.status === 'error' && 'bg-red-500',
                    chunk.status !== 'completed' &&
                      chunk.status !== 'error' &&
                      'bg-brand-purple animate-pulse'
                  )}
                />
                <span className="text-slate-700 text-sm font-medium">
                  {typeof chunk.id === 'number'
                    ? t('chunks.segment', { id: chunk.id })
                    : chunk.id === 'init'
                      ? t('chunks.init')
                      : chunk.id === 'decoding'
                        ? t('chunks.decoding')
                        : chunk.id === 'segmenting'
                          ? t('chunks.segmenting')
                          : chunk.id === 'glossary'
                            ? t('chunks.glossary')
                            : chunk.id === 'diarization'
                              ? t('chunks.diarization')
                              : t('chunks.segment', { id: chunk.id })}
                </span>
              </div>
              <div className="flex-1 flex items-center justify-end space-x-4">
                <span className="text-xs font-medium text-slate-500">
                  {chunk.message || chunk.status}
                </span>
                {chunk.status === 'processing' && (
                  <Loader2 className="w-3 h-3 animate-spin text-slate-500" />
                )}
                {chunk.status === 'completed' && (
                  <CheckCircle className="w-3 h-3 text-emerald-500" />
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <div className="flex justify-between text-xs text-slate-500 mb-2 font-medium">
            <span>{t('footer.progress')}</span>
            <span>{t('footer.completed', { completed, total })}</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden border border-slate-300/50">
            <div
              className={cn(
                'h-full transition-all duration-500 ease-out',
                status === GenerationStatus.CANCELLED && 'bg-orange-500',
                status === GenerationStatus.PROOFREADING && 'bg-brand-purple',
                status !== GenerationStatus.CANCELLED &&
                  status !== GenerationStatus.PROOFREADING &&
                  'bg-brand-purple'
              )}
              style={{ width: `${percent}%` }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
};
