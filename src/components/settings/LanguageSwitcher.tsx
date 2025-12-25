import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { CustomSelect } from '@/components/settings/CustomSelect';
import { useSettings } from '@/hooks';

interface LanguageSwitcherProps {
  className?: string;
}

/**
 * Language switcher component for selecting UI language
 * Persists selection to unified settings storage
 */
export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ className }) => {
  const { i18n, t } = useTranslation('common');
  const { settings, updateSetting, isSettingsLoaded } = useSettings();

  const options = [
    { value: 'zh-CN', label: t('languages.zh-CN') },
    { value: 'en-US', label: t('languages.en-US') },
  ];

  // Initialize language from settings on load
  useEffect(() => {
    if (isSettingsLoaded && settings.language) {
      // If we have a saved language preference, apply it
      if (i18n.language !== settings.language) {
        void i18n.changeLanguage(settings.language);
      }
    }
  }, [isSettingsLoaded, settings.language, i18n]);

  const handleLanguageChange = (lang: string) => {
    void i18n.changeLanguage(lang);
    updateSetting('language', lang as 'zh-CN' | 'en-US');
  };

  // Determine current value: use settings.language if available, otherwise detect from i18n
  const currentValue = settings.language || (i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US');

  return (
    <CustomSelect
      value={currentValue}
      onChange={handleLanguageChange}
      options={options}
      icon={<Languages className="w-4 h-4" />}
      className={className}
    />
  );
};
