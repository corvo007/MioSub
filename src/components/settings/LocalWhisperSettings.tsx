import React from 'react';
import { useTranslation } from 'react-i18next';
import { logger } from '@/services/utils/logger';

interface LocalWhisperSettingsProps {
  useLocalWhisper: boolean;
  whisperModelPath?: string;
  onToggle: (enabled: boolean) => void;
  onModelPathChange: (path: string) => void;
  addToast: (message: string, type: 'info' | 'warning' | 'error' | 'success') => void;
}

export const LocalWhisperSettings: React.FC<LocalWhisperSettingsProps> = ({
  whisperModelPath,
  onModelPathChange,
  addToast,
}) => {
  const { t } = useTranslation('settings');
  // Select model
  const handleSelect = async () => {
    if (!window.electronAPI) {
      console.error('[LocalWhisperSettings] electronAPI not available for selection');
      return;
    }
    console.log('[LocalWhisperSettings] Requesting model selection...');
    try {
      const result = await window.electronAPI.selectWhisperModel();
      console.log('[LocalWhisperSettings] Model selection result:', result);

      if (result && result.success && result.path) {
        onModelPathChange(result.path);
      } else if (result && result.error) {
        // Show error toast to user
        addToast(
          t('services.transcription.localWhisperSettings.selectError', { error: result.error }),
          'error'
        );
        console.error('[LocalWhisperSettings] Model selection error:', result.error);
      }
    } catch (error: any) {
      logger.error('[LocalWhisperSettings] Model selection failed', error);
      addToast(t('services.transcription.localWhisperSettings.selectErrorGeneric'), 'error');
    }
  };

  return (
    <div className="space-y-4 p-4 border border-slate-700 rounded-lg bg-slate-800/50">
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-slate-200">
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
          className="flex-1 px-3 py-2 border border-slate-700 rounded bg-slate-900 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
        />
        <button
          onClick={handleSelect}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors"
        >
          {t('services.transcription.localWhisperSettings.browseButton')}
        </button>
      </div>

      <div className="text-xs text-slate-400 bg-slate-900/50 p-2 rounded border border-slate-700/50">
        <p className="font-medium mb-1 text-slate-300">
          {t('services.transcription.localWhisperSettings.instructionsTitle')}
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li
            dangerouslySetInnerHTML={{
              __html: t('services.transcription.localWhisperSettings.instructionGgml'),
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
              className="text-blue-400 underline hover:text-blue-300 cursor-pointer"
            >
              {t('services.transcription.localWhisperSettings.instructionModelLink')}
            </a>
            {t('services.transcription.localWhisperSettings.instructionModelSuffix')}
          </li>
        </ul>
      </div>
    </div>
  );
};
