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
        className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 pl-3 text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
      />
      <button
        onClick={onReset}
        className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-700 transition-colors whitespace-nowrap"
        title={t('inputWithReset.resetDefault')}
      >
        {t('inputWithReset.reset')}
      </button>
    </div>
  );
};
