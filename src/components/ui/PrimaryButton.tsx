import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

interface PrimaryButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  icon?: React.ReactNode;
  variant?: 'primary' | 'success';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  className?: string;
}

const variantClasses = {
  primary:
    'bg-linear-to-r from-brand-purple to-brand-orange hover:shadow-brand-purple/40 shadow-brand-purple/20',
  success:
    'bg-linear-to-r from-emerald-500 to-teal-500 hover:shadow-emerald-500/40 shadow-emerald-500/20',
};

const sizeClasses = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-6 py-3',
  lg: 'px-6 py-4',
};

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  children,
  onClick,
  type = 'button',
  disabled = false,
  loading = false,
  loadingText,
  icon,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
}) => {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      className={cn(
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        'rounded-xl text-white font-medium',
        'transition-all hover:-translate-y-0.5 hover:shadow-lg',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none',
        className
      )}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          {loadingText || children}
        </span>
      ) : (
        <span className="flex items-center justify-center gap-2">
          {icon}
          {children}
        </span>
      )}
    </button>
  );
};
