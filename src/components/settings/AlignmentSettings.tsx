import React from 'react';
import { useTranslation } from 'react-i18next';
import { Crosshair } from 'lucide-react';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { type AppSettings } from '@/types/settings';
import { logger } from '@/services/utils/logger';

interface AlignmentSettingsProps {
  settings: AppSettings;
  updateSetting: (key: keyof AppSettings, value: any) => void;
  addToast: (message: string, type: 'info' | 'warning' | 'error' | 'success') => void;
}

export const AlignmentSettings: React.FC<AlignmentSettingsProps> = ({
  settings,
  updateSetting,
  addToast,
}) => {
  const { t } = useTranslation('settings');

  // CTC alignment requires Electron environment (uses IPC for native process)
  const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

  // Build alignment mode options - CTC only available in Electron
  const alignmentOptions = [
    { value: 'none', label: t('enhance.alignment.modeOptions.none') },
    ...(isElectron ? [{ value: 'ctc', label: t('enhance.alignment.modeOptions.ctc') }] : []),
  ];

  // Handle aligner executable selection
  const handleSelectAligner = async () => {
    if (!window.electronAPI) {
      logger.error('[AlignmentSettings] electronAPI not available for selection');
      return;
    }
    try {
      const result = await window.electronAPI.selectAlignerExecutable();
      if (result && result.success && result.path) {
        updateSetting('alignerPath', result.path);
      } else if (result && result.error) {
        addToast(t('enhance.alignment.selectError', { error: result.error }), 'error');
        logger.error('[AlignmentSettings] Aligner selection error', result.error);
      }
    } catch (error: any) {
      logger.error('[AlignmentSettings] Aligner selection failed', error);
      addToast(t('enhance.alignment.selectErrorGeneric'), 'error');
    }
  };

  // Handle model directory selection
  const handleSelectModelDir = async () => {
    if (!window.electronAPI) {
      logger.error('[AlignmentSettings] electronAPI not available for selection');
      return;
    }
    try {
      const result = await window.electronAPI.selectAlignerModelDir();
      if (result && result.success && result.path) {
        updateSetting('alignmentModelPath', result.path);
      } else if (result && result.error) {
        addToast(t('enhance.alignment.selectError', { error: result.error }), 'error');
        logger.error('[AlignmentSettings] Model dir selection error', result.error);
      }
    } catch (error: any) {
      logger.error('[AlignmentSettings] Model dir selection failed', error);
      addToast(t('enhance.alignment.selectErrorGeneric'), 'error');
    }
  };

  return (
    <div className="space-y-4">
      {/* Mode Selection */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          {t('enhance.alignment.mode')}
        </label>
        <CustomSelect
          value={settings.alignmentMode || 'none'}
          onChange={(val) => updateSetting('alignmentMode', val)}
          options={alignmentOptions}
          icon={<Crosshair className="w-4 h-4" />}
        />
        <p className="text-xs text-slate-500 mt-1">{t('enhance.alignment.modeHint')}</p>
      </div>

      {/* CTC-specific settings */}
      {settings.alignmentMode === 'ctc' && (
        <div className="space-y-4 p-4 border border-slate-200 rounded-lg bg-white shadow-sm animate-fade-in">
          <div className="space-y-1">
            <h3 className="text-sm font-medium text-slate-800">
              {t('enhance.alignment.ctcConfig')}
            </h3>
            <p className="text-xs text-slate-500">{t('enhance.alignment.ctcConfigDesc')}</p>
          </div>

          {/* Aligner Path */}
          <div>
            <label className="block text-xs text-slate-600 mb-1">
              {t('enhance.alignment.alignerPath')}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={settings.alignerPath || ''}
                placeholder={t('enhance.alignment.alignerPathPlaceholder')}
                readOnly
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-700 placeholder-slate-400 focus:outline-none focus:border-brand-purple focus:ring-1 focus:ring-brand-purple text-sm shadow-sm transition-all"
              />
              <button
                onClick={handleSelectAligner}
                className="px-4 py-2 bg-brand-purple hover:bg-brand-purple/90 text-white rounded-lg transition-colors text-sm font-medium shadow-sm"
              >
                {t('enhance.alignment.browseButton')}
              </button>
            </div>
          </div>

          {/* Model Path */}
          <div>
            <label className="block text-xs text-slate-600 mb-1">
              {t('enhance.alignment.modelPath')}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={settings.alignmentModelPath || ''}
                placeholder={t('enhance.alignment.modelPathPlaceholder')}
                readOnly
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-700 placeholder-slate-400 focus:outline-none focus:border-brand-purple focus:ring-1 focus:ring-brand-purple text-sm shadow-sm transition-all"
              />
              <button
                onClick={handleSelectModelDir}
                className="px-4 py-2 bg-brand-purple hover:bg-brand-purple/90 text-white rounded-lg transition-colors text-sm font-medium shadow-sm"
              >
                {t('enhance.alignment.browseButton')}
              </button>
            </div>
          </div>

          {/* Instructions */}
          <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
            <p className="font-medium mb-1 text-slate-800">{t('enhance.alignment.instructions')}</p>
            <ul className="list-disc list-inside space-y-1">
              <li dangerouslySetInnerHTML={{ __html: t('enhance.alignment.instructionAligner') }} />
              <li dangerouslySetInnerHTML={{ __html: t('enhance.alignment.instructionModel') }} />
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
