import React from 'react';
import { useTranslation } from 'react-i18next';
import { Type, Languages } from 'lucide-react';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { LanguageSwitcher } from '@/components/settings/LanguageSwitcher';
import { OptionButton } from '@/components/ui/OptionButton';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { TabProps } from './types';

export const GeneralTab: React.FC<TabProps> = ({ settings, updateSetting }) => {
  const { t } = useTranslation('settings');

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
    </div>
  );
};
