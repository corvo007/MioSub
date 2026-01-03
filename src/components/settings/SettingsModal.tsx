import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, X, Languages, Type, Clock, Book, Bug, Trash2 } from 'lucide-react';
import { type AppSettings } from '@/types/settings';
import { CustomSelect } from '@/components/settings/CustomSelect';
import { LocalWhisperSettings } from '@/components/settings/LocalWhisperSettings';
import { LanguageSwitcher } from '@/components/settings/LanguageSwitcher';
import { Toggle } from '@/components/ui/Toggle';
import { NumberInput } from '@/components/ui/NumberInput';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { InputWithReset } from '@/components/ui/InputWithReset';
import { EnvKeyHint } from '@/components/ui/EnvKeyHint';
import { SettingRow } from '@/components/ui/SettingRow';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { OptionButton } from '@/components/ui/OptionButton';
import { cn } from '@/lib/cn';

// Format bytes to human readable string
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Cache Management Component
const CacheManagement: React.FC = () => {
  const { t } = useTranslation('settings');
  const [cacheInfo, setCacheInfo] = useState<{ size: number; fileCount: number } | null>(null);
  const [clearing, setClearing] = useState(false);

  const loadCacheInfo = useCallback(async () => {
    if (window.electronAPI?.cache?.getSize) {
      const info = await window.electronAPI.cache.getSize();
      setCacheInfo(info);
    }
  }, []);

  useEffect(() => {
    void loadCacheInfo();
  }, [loadCacheInfo]);

  const handleClearCache = async () => {
    if (!window.electronAPI?.cache?.clear) return;
    setClearing(true);
    try {
      await window.electronAPI.cache.clear();
      await loadCacheInfo();
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-3">
      <SectionHeader>{t('performance.cache.title', 'Video Preview Cache')}</SectionHeader>
      <div className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3">
        <div>
          <p className="text-sm text-slate-300">
            {t('performance.cache.currentSize', 'Current Size')}
          </p>
          <p className="text-lg font-semibold text-white">
            {cacheInfo ? formatBytes(cacheInfo.size) : '...'}
            <span className="text-sm text-slate-500 ml-2">
              ({cacheInfo?.fileCount ?? 0} {t('performance.cache.files', 'files')})
            </span>
          </p>
        </div>
        <button
          onClick={handleClearCache}
          disabled={clearing || !cacheInfo || cacheInfo.fileCount === 0}
          className="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 hover:text-red-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-4 h-4" />
          {clearing
            ? t('performance.cache.clearing', 'Clearing...')
            : t('performance.cache.clear', 'Clear Cache')}
        </button>
      </div>
      <p className="text-xs text-slate-500">
        {t(
          'performance.cache.hint',
          'Cached video previews allow faster loading when reopening the same video.'
        )}
      </p>
    </div>
  );
};

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  updateSetting: (key: keyof AppSettings, value: any) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  envGeminiKey: string;
  envOpenaiKey: string;
  onOpenGlossaryManager: () => void;
  addToast: (message: string, type: 'info' | 'warning' | 'error' | 'success') => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  updateSetting,
  activeTab,
  setActiveTab,
  envGeminiKey,
  envOpenaiKey,
  onOpenGlossaryManager,
  addToast,
}) => {
  const { t } = useTranslation('settings');
  const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl flex flex-col shadow-2xl animate-fade-in relative overflow-hidden"
        style={{ maxHeight: 'calc(var(--app-height-safe, 100vh) * 0.9)' }}
      >
        <div className="p-6 overflow-y-auto custom-scrollbar">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-bold text-white mb-6 flex items-center">
            <Settings className="w-5 h-5 mr-2 text-indigo-400" /> {t('title')}
          </h2>

          <div className="flex space-x-1 border-b border-slate-700 mb-6 overflow-x-auto">
            {[
              'general',
              'services',
              'performance',
              'enhance',
              ...(window.electronAPI?.isDebug ? ['debug'] : []),
            ].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap',
                  activeTab === tab
                    ? 'bg-slate-800 text-indigo-400 border-t border-x border-slate-700'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                )}
              >
                {t(`tabs.${tab}`)}
              </button>
            ))}
          </div>

          <div className="space-y-6 min-h-[400px]">
            {activeTab === 'general' && (
              <div className="space-y-6 animate-fade-in">
                {/* Interface Zoom Settings */}
                <div className="space-y-3">
                  <SectionHeader>{t('general.display.title')}</SectionHeader>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">
                      {t('general.display.zoomLevel')}
                    </label>
                    <CustomSelect
                      value={settings.zoomLevel?.toString() || '1'}
                      onChange={(val) => updateSetting('zoomLevel', parseFloat(val))}
                      options={[
                        { value: '0.5', label: t('general.display.zoomOptions.50') },
                        { value: '0.67', label: t('general.display.zoomOptions.67') },
                        { value: '0.75', label: t('general.display.zoomOptions.75') },
                        { value: '0.8', label: t('general.display.zoomOptions.80') },
                        { value: '0.9', label: t('general.display.zoomOptions.90') },
                        { value: '1', label: t('general.display.zoomOptions.100') },
                        { value: '1.1', label: t('general.display.zoomOptions.110') },
                        { value: '1.25', label: t('general.display.zoomOptions.125') },
                        { value: '1.5', label: t('general.display.zoomOptions.150') },
                      ]}
                      icon={<Type className="w-4 h-4" />}
                    />
                    <p className="text-xs text-slate-500 mt-2">{t('general.display.zoomHint')}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">
                      {t('general.display.language')}
                    </label>
                    <LanguageSwitcher />
                    <p className="text-xs text-slate-500 mt-2">
                      {t('general.display.languageHint')}
                    </p>
                  </div>
                </div>

                {/* Output Settings */}
                <div className="space-y-3">
                  <SectionHeader>{t('general.output.title')}</SectionHeader>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">
                      {t('general.output.exportMode')}
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <OptionButton
                        selected={settings.outputMode === 'bilingual'}
                        onClick={() => updateSetting('outputMode', 'bilingual')}
                        size="md"
                      >
                        <Languages className="w-4 h-4" />
                        <span>{t('general.output.bilingual')}</span>
                      </OptionButton>
                      <OptionButton
                        selected={settings.outputMode === 'target_only'}
                        onClick={() => updateSetting('outputMode', 'target_only')}
                        size="md"
                      >
                        <Type className="w-4 h-4" />
                        <span>{t('general.output.targetOnly')}</span>
                      </OptionButton>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      {t('general.output.bilingualHint')}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'services' && (
              <div className="space-y-6 animate-fade-in">
                {/* API Settings */}
                <div className="space-y-4">
                  <SectionHeader>{t('services.translation.title')}</SectionHeader>
                  <div className="space-y-4">
                    {/* Gemini */}
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">
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
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">
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
                <div className="space-y-4 pt-4 border-t border-slate-800">
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
                        <div className="space-y-4 animate-fade-in">
                          <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">
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
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">
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
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">
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
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">
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
                  )}
                </div>
              </div>
            )}

            {activeTab === 'performance' && (
              <div className="space-y-6 animate-fade-in">
                {/* Local Whisper Performance Settings */}
                {/* Local Whisper Performance Settings */}
                {settings.useLocalWhisper && (
                  <div className="space-y-4">
                    <SectionHeader>{t('performance.localWhisper.title')}</SectionHeader>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">
                          {t('performance.localWhisper.cpuThreads')}
                        </label>
                        <NumberInput
                          value={settings.whisperThreads}
                          onChange={(v) => updateSetting('whisperThreads', v)}
                          min={1}
                          max={16}
                          defaultOnBlur={4}
                          placeholder="4"
                          className="w-full"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          {t('performance.localWhisper.cpuThreadsHint')}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">
                          {t('performance.localWhisper.concurrency')}
                        </label>
                        <NumberInput
                          value={settings.whisperConcurrency}
                          onChange={(v) => updateSetting('whisperConcurrency', v)}
                          min={1}
                          max={4}
                          defaultOnBlur={1}
                          placeholder="1"
                          className="w-full"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          {t('performance.localWhisper.concurrencyHint')}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Batch Processing Section */}
                <div className="space-y-4">
                  <SectionHeader>{t('performance.batch.title')}</SectionHeader>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">
                        {t('performance.batch.proofreadBatchSize')}
                      </label>
                      <NumberInput
                        value={settings.proofreadBatchSize || undefined}
                        onChange={(v) => updateSetting('proofreadBatchSize', v ?? 0)}
                        min={0}
                        className="w-full"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        {t('performance.batch.proofreadBatchSizeHint')}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">
                        {t('performance.batch.translationBatchSize')}
                      </label>
                      <NumberInput
                        value={settings.translationBatchSize || undefined}
                        onChange={(v) => updateSetting('translationBatchSize', v ?? 0)}
                        min={0}
                        className="w-full"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        {t('performance.batch.translationBatchSizeHint')}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">
                        {t('performance.batch.chunkDuration')}
                      </label>
                      <NumberInput
                        value={settings.chunkDuration || undefined}
                        onChange={(v) => updateSetting('chunkDuration', v ?? 0)}
                        min={0}
                        className="w-full"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        {t('performance.batch.chunkDurationHint')}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Concurrency & Timeout Section */}
                <div className="space-y-4">
                  <SectionHeader>{t('performance.concurrency.title')}</SectionHeader>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">
                        {t('performance.concurrency.concurrencyFlash')}
                      </label>
                      <NumberInput
                        value={settings.concurrencyFlash || undefined}
                        onChange={(v) => updateSetting('concurrencyFlash', v ?? 0)}
                        min={0}
                        className="w-full"
                      />
                      <p
                        className="text-xs text-slate-500 mt-1"
                        dangerouslySetInnerHTML={{
                          __html: t('performance.concurrency.concurrencyFlashHint'),
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">
                        {t('performance.concurrency.concurrencyPro')}
                      </label>
                      <NumberInput
                        value={settings.concurrencyPro || undefined}
                        onChange={(v) => updateSetting('concurrencyPro', v ?? 0)}
                        min={0}
                        className="w-full"
                      />
                      <p
                        className="text-xs text-slate-500 mt-1"
                        dangerouslySetInnerHTML={{
                          __html: t('performance.concurrency.concurrencyProHint'),
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">
                        {t('performance.concurrency.requestTimeout')}
                      </label>
                      <NumberInput
                        value={settings.requestTimeout || undefined}
                        onChange={(v) => updateSetting('requestTimeout', v ?? 600)}
                        min={0}
                        placeholder="600"
                        className="w-full"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        {t('performance.concurrency.requestTimeoutHint')}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Audio Processing Section */}
                <div className="space-y-4">
                  <SectionHeader>{t('performance.audio.title')}</SectionHeader>
                  <SettingRow
                    label={t('performance.audio.smartSplit')}
                    description={t('performance.audio.smartSplitDesc')}
                  >
                    <Toggle
                      checked={settings.useSmartSplit !== false}
                      onChange={(v) => updateSetting('useSmartSplit', v)}
                    />
                  </SettingRow>
                </div>

                {/* Video Preview Cache - Only show in Electron */}
                {isElectron && (
                  <div className="space-y-4">
                    <CacheManagement />
                  </div>
                )}
              </div>
            )}

            {activeTab === 'enhance' && (
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
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">
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
                </div>

                {/* Manage Glossary Button */}
                <div>
                  <button
                    onClick={() => {
                      onClose();
                      onOpenGlossaryManager();
                    }}
                    className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors flex items-center justify-center text-sm font-medium"
                  >
                    <Book className="w-4 h-4 mr-2" /> {t('enhance.glossary.manageGlossary')}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'debug' && (
              <div className="space-y-3 animate-fade-in">
                <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-4 mb-4">
                  <h3 className="text-sm font-semibold text-amber-300 mb-2 flex items-center">
                    <Bug className="w-4 h-4 mr-2" /> {t('debug.title')}
                  </h3>
                  <p className="text-xs text-slate-400 mb-4">{t('debug.description')}</p>

                  <div className="space-y-4">
                    <SettingRow
                      label={t('debug.mockGemini')}
                      description={t('debug.mockGeminiDesc')}
                    >
                      <Toggle
                        checked={settings.debug?.mockGemini || false}
                        onChange={(v) =>
                          updateSetting('debug', {
                            ...settings.debug,
                            mockGemini: v,
                          })
                        }
                        color="amber"
                      />
                    </SettingRow>

                    <SettingRow
                      label={t('debug.mockOpenAI')}
                      description={t('debug.mockOpenAIDesc')}
                    >
                      <Toggle
                        checked={settings.debug?.mockOpenAI || false}
                        onChange={(v) =>
                          updateSetting('debug', {
                            ...settings.debug,
                            mockOpenAI: v,
                          })
                        }
                        color="amber"
                      />
                    </SettingRow>

                    <SettingRow
                      label={t('debug.mockLocalWhisper')}
                      description={t('debug.mockLocalWhisperDesc')}
                    >
                      <Toggle
                        checked={settings.debug?.mockLocalWhisper || false}
                        onChange={(v) =>
                          updateSetting('debug', {
                            ...settings.debug,
                            mockLocalWhisper: v,
                          })
                        }
                        color="amber"
                      />
                    </SettingRow>

                    <SettingRow
                      label={t('debug.saveIntermediateArtifacts')}
                      description={t('debug.saveIntermediateArtifactsDesc')}
                    >
                      <Toggle
                        checked={settings.debug?.saveIntermediateArtifacts || false}
                        onChange={(v) =>
                          updateSetting('debug', {
                            ...settings.debug,
                            saveIntermediateArtifacts: v,
                          })
                        }
                        color="amber"
                      />
                    </SettingRow>

                    <div className="pt-4 border-t border-slate-700">
                      <h4 className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wider">
                        {t('debug.customPaths')}
                      </h4>

                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">
                            {t('debug.ffmpegPath')}
                          </label>
                          <input
                            type="text"
                            value={settings.debug?.ffmpegPath || ''}
                            onChange={(e) =>
                              updateSetting('debug', {
                                ...settings.debug,
                                ffmpegPath: e.target.value,
                              })
                            }
                            placeholder={t('debug.defaultAutoDetected')}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">
                            {t('debug.ffprobePath')}
                          </label>
                          <input
                            type="text"
                            value={settings.debug?.ffprobePath || ''}
                            onChange={(e) =>
                              updateSetting('debug', {
                                ...settings.debug,
                                ffprobePath: e.target.value,
                              })
                            }
                            placeholder={t('debug.defaultAutoDetected')}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">
                            {t('debug.whisperPath')}
                          </label>
                          <input
                            type="text"
                            value={settings.debug?.whisperPath || ''}
                            onChange={(e) =>
                              updateSetting('debug', {
                                ...settings.debug,
                                whisperPath: e.target.value,
                              })
                            }
                            placeholder={t('debug.defaultAutoDetected')}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
