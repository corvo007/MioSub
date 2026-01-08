import React from 'react';
import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CustomSelect } from '@/components/ui/CustomSelect';

interface TargetLanguageSelectorProps {
  value?: string;
  onChange: (value: string) => void;
  className?: string;
  variant?: 'default' | 'inline';
}

export const TargetLanguageSelector: React.FC<TargetLanguageSelectorProps> = ({
  value = 'zh-CN',
  onChange,
  className = '',
  variant = 'default',
}) => {
  const { t } = useTranslation('settings');

  const languages = [
    { value: 'zh-CN', label: t('languages.simplifiedChinese') },
    { value: 'zh-TW', label: t('languages.traditionalChinese') },
    { value: 'en', label: t('languages.english') },
    { value: 'ja', label: t('languages.japanese') },
    { value: 'ko', label: t('languages.korean') },
    { value: 'es', label: t('languages.spanish') },
    { value: 'fr', label: t('languages.french') },
    { value: 'de', label: t('languages.german') },
    { value: 'ru', label: t('languages.russian') },
    { value: 'pt', label: t('languages.portuguese') },
    { value: 'it', label: t('languages.italian') },
    { value: 'vi', label: t('languages.vietnamese') },
    { value: 'th', label: t('languages.thai') },
    { value: 'id', label: t('languages.indonesian') },
  ];

  if (variant === 'inline') {
    return (
      <CustomSelect
        value={value}
        onChange={onChange}
        options={languages}
        className={className}
        placeholder={t('general.output.targetLanguage.placeholder')}
      />
    );
  }

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
        <Languages className="w-4 h-4" />
        {t('general.output.targetLanguage.label')}
      </label>
      <CustomSelect
        value={value}
        onChange={onChange}
        options={languages}
        placeholder={t('general.output.targetLanguage.placeholder')}
      />
      <p className="mt-1.5 text-xs text-slate-500">
        {t('general.output.targetLanguage.description')}
      </p>
    </div>
  );
};
