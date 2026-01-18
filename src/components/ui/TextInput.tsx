import React from 'react';
import { cn } from '@/lib/cn';

interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  error?: string;
  variant?: 'default' | 'transparent';
}

const variantClasses = {
  default:
    'bg-white border-slate-200 text-slate-700 focus:border-brand-purple focus:ring-1 focus:ring-brand-purple placeholder-slate-400 shadow-sm',
  transparent:
    'bg-white border-slate-200 text-slate-700 focus:border-brand-purple/50 focus:ring-1 focus:ring-brand-purple/20 placeholder-slate-400',
};

export const TextInput: React.FC<TextInputProps> = ({
  icon,
  error,
  variant = 'default',
  className = '',
  ...props
}) => (
  <div className="relative">
    {icon && (
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>
    )}
    <input
      className={cn(
        'w-full border rounded-lg py-2 px-3 text-sm focus:outline-none transition-all',
        variantClasses[variant],
        icon && 'pl-10',
        error && 'border-red-500',
        className
      )}
      {...props}
    />
    {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
  </div>
);
