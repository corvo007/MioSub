import React, { useState } from 'react';
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
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative">
      <input
        type={showPassword ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={cn(
          'w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 pl-3 pr-10',
          'text-slate-200 text-sm',
          'focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500',
          className
        )}
      />
      <button
        type="button"
        onClick={() => setShowPassword(!showPassword)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
        title={showPassword ? '隐藏密钥' : '显示密钥'}
      >
        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
};
