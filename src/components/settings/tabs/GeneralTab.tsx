import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Type, Languages } from 'lucide-react';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { LanguageSwitcher } from '@/components/settings/LanguageSwitcher';
import { OptionButton } from '@/components/ui/OptionButton';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { InputWithReset } from '@/components/ui/InputWithReset';
import type { TabProps } from './types';

export const GeneralTab: React.FC<TabProps> = ({ settings, updateSetting }) => {
  const { t } = useTranslation('settings');
  const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

  const proxyMode = settings.proxyMode || 'system';

  const handleProxyModeChange = useCallback(
    (mode: 'system' | 'custom' | 'direct') => {
      updateSetting('proxyMode', mode);
      if (isElectron) {
        window.electronAPI.proxy.apply({
          mode,
          url: mode === 'custom' ? settings.proxyUrl : undefined,
        });
      }
    },
    [updateSetting, isElectron, settings.proxyUrl]
  );

  const handleProxyUrlChange = useCallback(
    (url: string) => {
      updateSetting('proxyUrl', url);
    },
    [updateSetting]
  );

  const applyCurrentProxy = useCallback(() => {
    if (isElectron && proxyMode === 'custom' && settings.proxyUrl) {
      window.electronAPI.proxy.apply({ mode: 'custom', url: settings.proxyUrl });
    }
  }, [isElectron, proxyMode, settings.proxyUrl]);

  const [testState, setTestState] = useState<'idle' | 'testing' | 'success' | 'fail'>('idle');
  const [testInfo, setTestInfo] = useState('');

  const handleTestProxy = useCallback(async () => {
    if (!isElectron) return;
    setTestState('testing');
    setTestInfo('');
    try {
      const result = await window.electronAPI.proxy.test({
        mode: proxyMode,
        url: proxyMode === 'custom' ? settings.proxyUrl : undefined,
      });
      if (result.success) {
        setTestState('success');
        setTestInfo(t('general.proxy.testSuccess', { latency: result.latencyMs }));
      } else {
        setTestState('fail');
        setTestInfo(result.error || t('general.proxy.testFail'));
      }
    } catch {
      setTestState('fail');
      setTestInfo(t('general.proxy.testFail'));
    }
  }, [isElectron, proxyMode, settings.proxyUrl, t]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Interface Zoom Settings */}
      <div className="space-y-3">
        <SectionHeader>{t('general.display.title')}</SectionHeader>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
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
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            {t('general.display.language')}
          </label>
          <LanguageSwitcher />
          <p className="text-xs text-slate-500 mt-2">{t('general.display.languageHint')}</p>
        </div>
      </div>

      {/* Output Settings */}
      <div className="space-y-3">
        <SectionHeader>{t('general.output.title')}</SectionHeader>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
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
          <p className="text-xs text-slate-500 mt-2">{t('general.output.bilingualHint')}</p>
        </div>
      </div>

      {/* Network Proxy Settings - Electron only */}
      {isElectron && (
        <div className="space-y-3">
          <SectionHeader>{t('general.proxy.title')}</SectionHeader>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('general.proxy.mode')}
            </label>
            <div className="grid grid-cols-3 gap-3">
              <OptionButton
                selected={proxyMode === 'system'}
                onClick={() => handleProxyModeChange('system')}
                size="md"
              >
                <span>{t('general.proxy.system')}</span>
              </OptionButton>
              <OptionButton
                selected={proxyMode === 'custom'}
                onClick={() => handleProxyModeChange('custom')}
                size="md"
              >
                <span>{t('general.proxy.custom')}</span>
              </OptionButton>
              <OptionButton
                selected={proxyMode === 'direct'}
                onClick={() => handleProxyModeChange('direct')}
                size="md"
              >
                <span>{t('general.proxy.direct')}</span>
              </OptionButton>
            </div>
            <p className="text-xs text-slate-500 mt-2">{t(`general.proxy.${proxyMode}Hint`)}</p>
          </div>

          {proxyMode === 'custom' && (
            <div className="animate-fade-in" onBlur={applyCurrentProxy}>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('general.proxy.url')}
              </label>
              <InputWithReset
                value={settings.proxyUrl || ''}
                onChange={handleProxyUrlChange}
                onReset={() => handleProxyUrlChange('')}
                placeholder={t('general.proxy.urlPlaceholder')}
              />
              <p className="text-xs text-slate-500 mt-1">{t('general.proxy.urlHint')}</p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleTestProxy}
              disabled={testState === 'testing' || (proxyMode === 'custom' && !settings.proxyUrl)}
              className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {testState === 'testing' ? t('general.proxy.testing') : t('general.proxy.test')}
            </button>
            {testInfo && (
              <span
                className={`text-xs ${testState === 'success' ? 'text-green-600' : 'text-red-500'}`}
              >
                {testInfo}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
