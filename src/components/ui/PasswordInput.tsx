import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/cn';

interface PasswordInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Reusable password input component for API keys and sensitive data
 * with show/hide toggle button
 */
export const PasswordInput: React.FC<PasswordInputProps> = ({
  value,
  onChange,
  placeholder,
  className,
}) => {
  const { t } = useTranslation('ui');
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative">
      <input
        type={showPassword ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={cn(
          'w-full bg-white border border-slate-200 rounded-lg py-2.5 pl-3 pr-10',
          'text-slate-700 text-sm placeholder-slate-400',
          'focus:outline-none focus:border-brand-purple focus:ring-1 focus:ring-brand-purple',
          'shadow-sm transition-all',
          className
        )}
      />
      <button
        type="button"
        onClick={() => setShowPassword(!showPassword)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
        title={showPassword ? t('passwordInput.hideKey') : t('passwordInput.showKey')}
      >
        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
};
