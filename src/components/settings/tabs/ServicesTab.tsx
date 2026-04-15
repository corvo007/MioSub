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

  // Derive effective transcription provider (migrates legacy useLocalWhisper flag)
  const provider: 'openai' | 'local' | 'camb' =
    settings.transcriptionProvider ?? (settings.useLocalWhisper ? 'local' : 'openai');

  const setProvider = (p: 'openai' | 'local' | 'camb') => {
    updateSetting('transcriptionProvider', p);
    // Keep legacy flag consistent for downstream code paths
    updateSetting('useLocalWhisper', p === 'local');
  };

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
            <div className="grid grid-cols-3 gap-3">
              <OptionButton
                selected={provider === 'openai'}
                onClick={() => setProvider('openai')}
                size="md"
              >
                <span>{t('services.transcription.openaiApi')}</span>
              </OptionButton>
              <OptionButton
                selected={provider === 'local'}
                onClick={() => setProvider('local')}
                size="md"
              >
                <span>{t('services.transcription.localWhisper')}</span>
              </OptionButton>
              <OptionButton
                selected={provider === 'camb'}
                onClick={() => setProvider('camb')}
                size="md"
              >
                <span>Camb AI</span>
              </OptionButton>
            </div>

            {provider === 'local' ? (
              <LocalWhisperSettings
                useLocalWhisper={true}
                whisperModelPath={settings.whisperModelPath}
                localWhisperBinaryPath={settings.localWhisperBinaryPath}
                onToggle={(enabled) => {
                  updateSetting('useLocalWhisper', enabled);
                }}
                onModelPathChange={(path) => {
                  updateSetting('whisperModelPath', path);
                }}
                onBinaryPathChange={(path) => {
                  updateSetting('localWhisperBinaryPath', path);
                }}
                addToast={addToast}
              />
            ) : provider === 'camb' ? (
              <CambSettings settings={settings} updateSetting={updateSetting} />
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

      {/* Camb AI (Dubbing + optional transcription) — always visible so users
          can configure dubbing even when using another transcription provider */}
      <div className="space-y-4 pt-4 border-t border-slate-200">
        <SectionHeader>Camb AI (Dubbing)</SectionHeader>
        <CambSettings settings={settings} updateSetting={updateSetting} />
      </div>
    </div>
  );
};

// Camb AI settings block (API key, default voice, target language)
const CambSettings: React.FC<{
  settings: ServicesTabProps['settings'];
  updateSetting: ServicesTabProps['updateSetting'];
}> = ({ settings, updateSetting }) => (
  <div className="space-y-4 animate-fade-in">
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">Camb API Key</label>
      <PasswordInput
        value={settings.cambApiKey || ''}
        onChange={(e) => updateSetting('cambApiKey', e.target.value.trim())}
        placeholder="camb_..."
      />
      <p className="text-xs text-slate-500 mt-1">
        Get a key from{' '}
        <a className="underline" href="https://studio.camb.ai" target="_blank" rel="noreferrer">
          studio.camb.ai
        </a>
        . Used for Camb transcription and the Dub action.
      </p>
    </div>
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        Default target language
      </label>
      <InputWithReset
        value={settings.cambTargetLanguage || ''}
        onChange={(val) => updateSetting('cambTargetLanguage', val)}
        onReset={() => updateSetting('cambTargetLanguage', undefined)}
        placeholder="en"
      />
      <p className="text-xs text-slate-500 mt-1">ISO code or Camb language id (e.g. "en", "es").</p>
    </div>
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">Default voice ID</label>
      <InputWithReset
        value={settings.cambDefaultVoiceId || ''}
        onChange={(val) => updateSetting('cambDefaultVoiceId', val)}
        onReset={() => updateSetting('cambDefaultVoiceId', undefined)}
        placeholder="voice_..."
      />
      <p className="text-xs text-slate-500 mt-1">
        Optional. If omitted Camb picks a default voice for the target language.
      </p>
    </div>
  </div>
);

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
