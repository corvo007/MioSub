import React from 'react';
import { useTranslation } from 'react-i18next';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { InputWithReset } from '@/components/ui/InputWithReset';
import { EnvKeyHint } from '@/components/ui/EnvKeyHint';
import { OptionButton } from '@/components/ui/OptionButton';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { LocalWhisperSettings } from '@/components/settings/LocalWhisperSettings';
import type { ServicesTabProps } from './types';

export const ServicesTab: React.FC<ServicesTabProps> = ({
  settings,
  updateSetting,
  envGeminiKey,
  envOpenaiKey,
  addToast,
}) => {
  const { t } = useTranslation('settings');
  const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* API Settings */}
      <div className="space-y-4">
        <SectionHeader>{t('services.translation.title')}</SectionHeader>
        <div className="space-y-4">
          {/* Gemini */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('services.translation.geminiKey')}
            </label>
            <div className="relative">
              <PasswordInput
                value={settings.geminiKey}
                onChange={(e) => updateSetting('geminiKey', e.target.value.trim())}
                placeholder={t('services.translation.geminiKeyPlaceholder')}
              />
            </div>
            <p
              className="text-xs text-slate-500 mt-1"
              dangerouslySetInnerHTML={{
                __html: t('services.translation.geminiKeyHint'),
              }}
            />
            <EnvKeyHint envKey={envGeminiKey} userKey={settings.geminiKey} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('services.translation.geminiEndpoint')}
            </label>
            <InputWithReset
              value={settings.geminiEndpoint || ''}
              onChange={(val) => updateSetting('geminiEndpoint', val)}
              onReset={() => updateSetting('geminiEndpoint', undefined)}
              placeholder={t('services.translation.geminiEndpointPlaceholder')}
            />
            <p className="text-xs text-slate-500 mt-1">
              {t('services.translation.geminiEndpointHint')}
            </p>
          </div>
        </div>
      </div>

      {/* Transcription Provider Settings */}
      <div className="space-y-4 pt-4 border-t border-slate-200">
        <SectionHeader>{t('services.transcription.title')}</SectionHeader>

        {isElectron ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <OptionButton
                selected={!settings.useLocalWhisper}
                onClick={() => updateSetting('useLocalWhisper', false)}
                size="md"
              >
                <span>{t('services.transcription.openaiApi')}</span>
              </OptionButton>
              <OptionButton
                selected={settings.useLocalWhisper || false}
                onClick={() => updateSetting('useLocalWhisper', true)}
                size="md"
              >
                <span>{t('services.transcription.localWhisper')}</span>
              </OptionButton>
            </div>

            {settings.useLocalWhisper ? (
              <LocalWhisperSettings
                useLocalWhisper={true}
                whisperModelPath={settings.whisperModelPath}
                onToggle={(enabled) => {
                  updateSetting('useLocalWhisper', enabled);
                }}
                onModelPathChange={(path) => {
                  updateSetting('whisperModelPath', path);
                }}
                addToast={addToast}
              />
            ) : (
              <OpenAISettings
                settings={settings}
                updateSetting={updateSetting}
                envOpenaiKey={envOpenaiKey}
                t={t}
              />
            )}
          </div>
        ) : (
          <OpenAISettings
            settings={settings}
            updateSetting={updateSetting}
            envOpenaiKey={envOpenaiKey}
            t={t}
          />
        )}
      </div>
    </div>
  );
};

// Internal component to avoid duplication
const OpenAISettings: React.FC<{
  settings: ServicesTabProps['settings'];
  updateSetting: ServicesTabProps['updateSetting'];
  envOpenaiKey: string;
  t: (key: string) => string;
}> = ({ settings, updateSetting, envOpenaiKey, t }) => (
  <div className="space-y-4 animate-fade-in">
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {t('services.transcription.openaiKey')}
      </label>
      <div className="relative">
        <PasswordInput
          value={settings.openaiKey}
          onChange={(e) => updateSetting('openaiKey', e.target.value.trim())}
          placeholder={t('services.transcription.openaiKeyPlaceholder')}
        />
      </div>
      <p
        className="text-xs text-slate-500 mt-1"
        dangerouslySetInnerHTML={{
          __html: t('services.transcription.openaiKeyHint'),
        }}
      />
      <EnvKeyHint envKey={envOpenaiKey} userKey={settings.openaiKey} />
    </div>
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {t('services.transcription.openaiEndpoint')}
      </label>
      <InputWithReset
        value={settings.openaiEndpoint || ''}
        onChange={(val) => updateSetting('openaiEndpoint', val)}
        onReset={() => updateSetting('openaiEndpoint', undefined)}
        placeholder={t('services.transcription.openaiEndpointPlaceholder')}
      />
      <p className="text-xs text-slate-500 mt-1">
        {t('services.transcription.openaiEndpointHint')}
      </p>
    </div>
  </div>
);
