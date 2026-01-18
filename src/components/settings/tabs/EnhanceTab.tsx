import React from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Book } from 'lucide-react';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { Toggle } from '@/components/ui/Toggle';
import { SettingRow } from '@/components/ui/SettingRow';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { AlignmentSettings } from '@/components/settings/AlignmentSettings';
import type { EnhanceTabProps } from './types';

interface EnhanceTabComponentProps extends EnhanceTabProps {
  onClose: () => void;
}

export const EnhanceTab: React.FC<EnhanceTabComponentProps> = ({
  settings,
  updateSetting,
  onOpenGlossaryManager,
  addToast,
  onClose,
}) => {
  const { t } = useTranslation('settings');

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Speaker Recognition Settings */}
      <div className="space-y-4">
        <SectionHeader>{t('enhance.speaker.title')}</SectionHeader>
        <SettingRow
          label={t('enhance.speaker.enableDiarization')}
          description={t('enhance.speaker.enableDiarizationDesc')}
        >
          <Toggle
            checked={settings.enableDiarization || false}
            onChange={(v) => updateSetting('enableDiarization', v)}
          />
        </SettingRow>

        {settings.enableDiarization && (
          <SettingRow
            label={t('enhance.speaker.enablePreAnalysis')}
            description={t('enhance.speaker.enablePreAnalysisDesc')}
            indented
          >
            <Toggle
              checked={settings.enableSpeakerPreAnalysis || false}
              onChange={(v) => {
                updateSetting('enableSpeakerPreAnalysis', v);
                // Auto-disable styled translation when pre-analysis is disabled
                if (!v) {
                  updateSetting('useSpeakerStyledTranslation', false);
                }
              }}
            />
          </SettingRow>
        )}

        {settings.enableDiarization && (
          <div className="space-y-4 animate-fade-in">
            <SettingRow
              label={t('enhance.speaker.includeSpeakerInExport')}
              description={t('enhance.speaker.includeSpeakerInExportDesc')}
              indented
            >
              <Toggle
                checked={settings.includeSpeakerInExport || false}
                onChange={(v) => updateSetting('includeSpeakerInExport', v)}
              />
            </SettingRow>
            <SettingRow
              label={t('enhance.speaker.useSpeakerColors')}
              description={t('enhance.speaker.useSpeakerColorsDesc')}
              indented
            >
              <Toggle
                checked={settings.useSpeakerColors || false}
                onChange={(v) => updateSetting('useSpeakerColors', v)}
              />
            </SettingRow>
            <SettingRow
              label={t('enhance.speaker.styledTranslation')}
              description={
                settings.enableSpeakerPreAnalysis
                  ? t('enhance.speaker.styledTranslationDesc')
                  : t('enhance.speaker.styledTranslationDisabledDesc')
              }
              indented
              disabled={!settings.enableSpeakerPreAnalysis}
            >
              <Toggle
                checked={settings.useSpeakerStyledTranslation || false}
                onChange={(v) => updateSetting('useSpeakerStyledTranslation', v)}
                disabled={!settings.enableSpeakerPreAnalysis}
              />
            </SettingRow>
          </div>
        )}
      </div>

      {/* Glossary Settings */}
      <div className="space-y-4">
        <SectionHeader>{t('enhance.glossary.title')}</SectionHeader>
        <SettingRow
          label={t('enhance.glossary.enableAutoGlossary')}
          description={t('enhance.glossary.enableAutoGlossaryDesc')}
        >
          <Toggle
            checked={settings.enableAutoGlossary !== false}
            onChange={(v) => updateSetting('enableAutoGlossary', v)}
          />
        </SettingRow>

        {settings.enableAutoGlossary !== false && (
          <div className="space-y-4 animate-fade-in">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('enhance.glossary.sampleDuration')}
              </label>
              <CustomSelect
                value={
                  settings.glossarySampleMinutes === 'all'
                    ? 'all'
                    : settings.glossarySampleMinutes.toString()
                }
                onChange={(val) => {
                  if (val === 'all') updateSetting('glossarySampleMinutes', 'all');
                  else updateSetting('glossarySampleMinutes', parseInt(val));
                }}
                options={[
                  { value: '5', label: t('enhance.glossary.sampleOptions.5') },
                  { value: '15', label: t('enhance.glossary.sampleOptions.15') },
                  { value: '30', label: t('enhance.glossary.sampleOptions.30') },
                  { value: 'all', label: t('enhance.glossary.sampleOptions.all') },
                ]}
                icon={<Clock className="w-4 h-4" />}
              />
              <p className="text-xs text-slate-500 mt-1">
                {t('enhance.glossary.sampleDurationHint')}
              </p>
            </div>

            <SettingRow
              label={t('enhance.glossary.autoConfirm')}
              description={t('enhance.glossary.autoConfirmDesc')}
            >
              <Toggle
                checked={settings.glossaryAutoConfirm || false}
                onChange={(v) => updateSetting('glossaryAutoConfirm', v)}
              />
            </SettingRow>
          </div>
        )}

        {/* Manage Glossary Button */}
        <button
          onClick={() => {
            onClose();
            onOpenGlossaryManager();
          }}
          className="w-full py-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 transition-all shadow-sm flex items-center justify-center text-sm font-medium"
        >
          <Book className="w-4 h-4 mr-2" /> {t('enhance.glossary.manageGlossary')}
        </button>
      </div>

      {/* Alignment Settings */}
      <div className="space-y-4">
        <SectionHeader>{t('enhance.alignment.title')}</SectionHeader>
        <AlignmentSettings settings={settings} updateSetting={updateSetting} addToast={addToast} />
      </div>
    </div>
  );
};
