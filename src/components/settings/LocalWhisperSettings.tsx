import React from 'react';
import { useTranslation } from 'react-i18next';
import { logger } from '@/services/utils/logger';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';

interface LocalWhisperSettingsProps {
  useLocalWhisper: boolean;
  whisperModelPath?: string;
  localWhisperBinaryPath?: string;
  onToggle: (enabled: boolean) => void;
  onModelPathChange: (path: string) => void;
  onBinaryPathChange: (path: string) => void;
  addToast: (message: string, type: 'info' | 'warning' | 'error' | 'success') => void;
}

export const LocalWhisperSettings: React.FC<LocalWhisperSettingsProps> = ({
  whisperModelPath,
  localWhisperBinaryPath,
  onModelPathChange,
  onBinaryPathChange,
  addToast,
}) => {
  const { t } = useTranslation('settings');
  // Select model - 防抖防止快速重复点击
  const handleSelect = useDebouncedCallback(async () => {
    if (!window.electronAPI) {
      logger.error('[LocalWhisperSettings] electronAPI not available for selection');
      return;
    }
    logger.info('[LocalWhisperSettings] Requesting model selection...');
    try {
      const result = await window.electronAPI.selectWhisperModel();
      logger.info(`[LocalWhisperSettings] Model selection result: ${JSON.stringify(result)}`);

      if (result && result.success && result.path) {
        onModelPathChange(result.path);
      } else if (result && result.error) {
        // Show error toast to user
        addToast(
          t('services.transcription.localWhisperSettings.selectError', { error: result.error }),
          'error'
        );
        logger.error('[LocalWhisperSettings] Model selection error', result.error);
      }
    } catch (error: any) {
      logger.error('[LocalWhisperSettings] Model selection failed', error);
      addToast(t('services.transcription.localWhisperSettings.selectErrorGeneric'), 'error');
    }
  });

  // Select binary
  const handleSelectBinary = useDebouncedCallback(async () => {
    if (!window.electronAPI) return;
    try {
      const result = await window.electronAPI.selectWhisperBinary();
      if (result && result.success && result.path) {
        onBinaryPathChange(result.path);
      } else if (result && result.error) {
        addToast(
          t('services.transcription.localWhisperSettings.selectError', { error: result.error }),
          'error'
        );
      }
    } catch (error: any) {
      addToast(t('services.transcription.localWhisperSettings.selectErrorGeneric'), 'error');
    }
  });

  return (
    <div className="space-y-4 p-4 border border-slate-200 rounded-lg bg-white shadow-sm">
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-slate-800">
          {t('services.transcription.localWhisperSettings.modelPathTitle')}
        </h3>
        <p className="text-xs text-slate-500">
          {t('services.transcription.localWhisperSettings.modelPathDesc')}
        </p>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={whisperModelPath || ''}
          placeholder={t('services.transcription.localWhisperSettings.modelPathPlaceholder')}
          readOnly
          className="flex-1 px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-700 placeholder-slate-400 focus:outline-none focus:border-brand-purple focus:ring-1 focus:ring-brand-purple shadow-sm transition-all"
        />
        <button
          onClick={handleSelect}
          className="px-4 py-2 bg-brand-purple hover:bg-brand-purple/90 text-white rounded-lg transition-colors shadow-sm font-medium"
        >
          {t('services.transcription.localWhisperSettings.browseButton')}
        </button>
      </div>

      <div className="space-y-1 mt-4">
        <h3 className="text-sm font-medium text-slate-800">
          {t('services.transcription.localWhisperSettings.binaryPathTitle')}
        </h3>
        <p
          className="text-xs text-slate-500"
          dangerouslySetInnerHTML={{
            __html: t('services.transcription.localWhisperSettings.binaryPathDesc'),
          }}
        />
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={localWhisperBinaryPath || ''}
          placeholder={t('services.transcription.localWhisperSettings.binaryPathPlaceholder')}
          readOnly
          className="flex-1 px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-700 placeholder-slate-400 focus:outline-none focus:border-brand-purple focus:ring-1 focus:ring-brand-purple shadow-sm transition-all"
        />
        <button
          onClick={handleSelectBinary}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg transition-colors shadow-sm font-medium"
        >
          {t('services.transcription.localWhisperSettings.browseButton')}
        </button>
      </div>

      <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
        <p className="font-medium mb-1 text-slate-800">
          {t('services.transcription.localWhisperSettings.instructionsTitle')}
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li
            dangerouslySetInnerHTML={{
              __html: t('services.transcription.localWhisperSettings.instructionGgml'),
            }}
          />
          <li
            dangerouslySetInnerHTML={{
              __html: t('services.transcription.localWhisperSettings.instructionBinaries'),
            }}
          />
          <li>
            {t('services.transcription.localWhisperSettings.instructionModel')}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                void window.electronAPI?.openExternal(
                  'https://huggingface.co/ggerganov/whisper.cpp'
                );
              }}
              className="text-blue-500 underline hover:text-blue-600 cursor-pointer ml-1"
            >
              {t('services.transcription.localWhisperSettings.instructionModelLink')}
            </a>
            {t('services.transcription.localWhisperSettings.instructionModelSuffix')}
          </li>
          <li>
            {t('services.transcription.localWhisperSettings.instructionDocs')}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                void window.electronAPI?.openExternal('https://www.miosub.app/docs/guide/whisper');
              }}
              className="text-blue-500 underline hover:text-blue-600 cursor-pointer ml-1"
            >
              {t('services.transcription.localWhisperSettings.instructionDocsLink')}
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
};
