import React, { useState } from 'react';
import { CheckCircle, XCircle, Film, FileText, Wand2, RefreshCw, Mic } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { OutputItem } from '@/components/endToEnd/wizard/shared/OutputItem';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useAppStore } from '@/store/useAppStore';

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
  const settings = useAppStore((s) => s.settings);
  const addToast = useAppStore((s) => s.addToast);
  const [dubbing, setDubbing] = useState(false);
  const [dubbedPath, setDubbedPath] = useState<string | undefined>(undefined);

  const handleOpenFolder = (path: string) => {
    if (window.electronAPI?.showItemInFolder) {
      void window.electronAPI.showItemInFolder(path);
    }
  };

  const handleDub = async () => {
    const src = outputs.outputVideoPath || outputs.videoPath;
    if (!src) return;
    if (!window.electronAPI?.camb?.dub) {
      addToast?.('Dubbing only available in desktop app', 'warning');
      return;
    }
    if (!settings.cambApiKey) {
      addToast?.('Please set Camb API key in Settings → Services', 'warning');
      return;
    }
    setDubbing(true);
    try {
      const res = await window.electronAPI.camb.dub({
        videoPath: src,
        apiKey: settings.cambApiKey,
        targetLanguage: settings.cambTargetLanguage || 'en',
        voiceId: settings.cambDefaultVoiceId,
      });
      if (res.success && res.outputPath) {
        setDubbedPath(res.outputPath);
        addToast?.('Dub complete', 'success');
      } else {
        addToast?.(`Dub failed: ${res.error || 'unknown'}`, 'error');
      }
    } catch (e: any) {
      addToast?.(`Dub failed: ${e?.message || e}`, 'error');
    } finally {
      setDubbing(false);
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
          {dubbedPath && (
            <OutputItem
              icon={<Mic className="w-5 h-5" />}
              label="Dubbed Video (Camb AI)"
              path={dubbedPath}
              onOpen={() => handleOpenFolder(dubbedPath)}
              highlight
            />
          )}
        </div>
      )}

      {/* Dub action */}
      {success && (outputs.outputVideoPath || outputs.videoPath) && (
        <div className="flex justify-center mb-6">
          <button
            onClick={handleDub}
            disabled={dubbing}
            className={cn(
              'px-5 py-2.5 rounded-xl text-sm font-medium border shadow-sm transition-colors flex items-center gap-2',
              dubbing
                ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-wait'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            )}
          >
            <Mic className="w-4 h-4" />
            {dubbing ? 'Dubbing…' : 'Dub video with Camb AI'}
          </button>
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
