import React from 'react';
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
  const { updateSetting } = useSettings();

  const options = [
    { value: 'zh-CN', label: t('languages.zh-CN') },
    { value: 'en-US', label: t('languages.en-US') },
    { value: 'ja-JP', label: t('languages.ja-JP') },
  ];

  const handleLanguageChange = (lang: string) => {
    void i18n.changeLanguage(lang);
    updateSetting('language', lang as 'zh-CN' | 'en-US' | 'ja-JP');
  };

  // Use i18n.language as source of truth (auto-detected on first use)
  const currentValue = i18n.language.startsWith('zh')
    ? 'zh-CN'
    : i18n.language.startsWith('ja')
      ? 'ja-JP'
      : 'en-US';

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
