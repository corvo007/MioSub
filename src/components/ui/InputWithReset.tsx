import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';

interface InputWithResetProps {
  value: string;
  onChange: (value: string) => void;
  onReset: () => void;
  placeholder?: string;
  className?: string;
}

/**
 * Text input with reset button for endpoint configuration
 */
export const InputWithReset: React.FC<InputWithResetProps> = ({
  value,
  onChange,
  onReset,
  placeholder,
  className,
}) => {
  const { t } = useTranslation('ui');

  return (
    <div className={cn('relative flex gap-2', className)}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        placeholder={placeholder}
        className="w-full bg-white border border-slate-200 rounded-lg py-2.5 pl-3 text-slate-700 focus:outline-none focus:border-brand-purple focus:ring-1 focus:ring-brand-purple text-sm placeholder-slate-400 shadow-sm transition-all"
      />
      <button
        onClick={onReset}
        className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm whitespace-nowrap font-medium"
        title={t('inputWithReset.resetDefault')}
      >
        {t('inputWithReset.reset')}
      </button>
    </div>
  );
};
