import React from 'react';
import { CheckCircle, XCircle, Film, FileText, Wand2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { OutputItem } from '@/components/endToEnd/wizard/shared/OutputItem';
import { PrimaryButton } from '@/components/ui/PrimaryButton';

/** 步骤 4: 结果展示 */
export function StepResult({
  result,
  onReset,
  onClose,
}: {
  result?: any;
  onReset: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('endToEnd');
  const success = result?.success;
  const outputs = result?.outputs || {};

  const handleOpenFolder = (path: string) => {
    if (window.electronAPI?.showItemInFolder) {
      void window.electronAPI.showItemInFolder(path);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div
          className={cn(
            'inline-flex items-center justify-center w-16 h-16 rounded-2xl border mb-4',
            success
              ? 'bg-linear-to-br from-emerald-500/20 to-teal-500/20 border-emerald-500/30'
              : 'bg-linear-to-br from-red-500/20 to-orange-500/20 border-red-500/30'
          )}
        >
          {success ? (
            <CheckCircle className="w-8 h-8 text-emerald-400" />
          ) : (
            <XCircle className="w-8 h-8 text-red-400" />
          )}
        </div>

        <h2 className="text-2xl font-bold text-slate-800 mb-2">
          {success ? t('wizard.resultStep.success') : t('wizard.resultStep.failure')}
        </h2>
        <p className="text-slate-500">
          {success
            ? t('wizard.resultStep.duration', {
                minutes: Math.round((result?.duration || 0) / 1000 / 60),
              })
            : result?.error || t('wizard.resultStep.unknownError')}
        </p>
      </div>

      {/* Outputs */}
      {success && (
        <div className="space-y-3 mb-8">
          {outputs.videoPath && (
            <OutputItem
              icon={<Film className="w-5 h-5" />}
              label={t('wizard.resultStep.originalVideo')}
              path={outputs.videoPath}
              onOpen={() => handleOpenFolder(outputs.videoPath)}
            />
          )}
          {outputs.subtitlePath && (
            <OutputItem
              icon={<FileText className="w-5 h-5" />}
              label={t('wizard.resultStep.subtitleFile')}
              path={outputs.subtitlePath}
              onOpen={() => handleOpenFolder(outputs.subtitlePath)}
            />
          )}
          {outputs.outputVideoPath && (
            <OutputItem
              icon={<Wand2 className="w-5 h-5" />}
              label={t('wizard.resultStep.outputVideo')}
              path={outputs.outputVideoPath}
              onOpen={() => handleOpenFolder(outputs.outputVideoPath)}
              highlight
            />
          )}
        </div>
      )}

      {/* Error Details */}
      {!success && result?.errorDetails && (
        <div className="p-4 bg-red-100 border border-red-300/50 rounded-xl mb-8 text-left shadow-sm">
          <div className="text-red-900 text-sm">
            <p className="font-bold mb-1.5 text-red-950 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-600 inline-block" />
              {t('wizard.resultStep.errorStage', {
                stage: t(`progress.stages.${result.errorDetails.stage}.label`, {
                  defaultValue: result.errorDetails.stage,
                }),
              })}
            </p>
            <p
              className="text-red-800 leading-relaxed font-medium pl-3.5 bg-white/40 p-2 rounded-lg border border-red-200/50 line-clamp-3 break-all"
              title={result.errorDetails.message}
            >
              {result.errorDetails.message}
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-4 justify-center">
        <button
          onClick={onReset}
          className="px-6 py-3 bg-white border border-slate-200 rounded-xl text-slate-700 font-medium transition-colors hover:bg-slate-50 shadow-sm"
        >
          <span className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            {t('wizard.resultStep.processNew')}
          </span>
        </button>
        <PrimaryButton onClick={onClose}>{t('wizard.resultStep.done')}</PrimaryButton>
      </div>
    </div>
  );
}
