import React from 'react';

interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  error?: string;
  variant?: 'default' | 'transparent';
}

const variantClasses = {
  default: 'bg-slate-800 border-slate-700 text-slate-200 focus:border-indigo-500',
  transparent:
    'bg-white/5 border-white/10 text-white focus:border-violet-500/50 placeholder-white/40',
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
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">{icon}</span>
    )}
    <input
      className={`w-full border rounded-lg py-2 px-3 text-sm focus:outline-none
        ${variantClasses[variant]}
        ${icon ? 'pl-10' : ''} 
        ${error ? 'border-red-500' : ''} 
        ${className}`}
      {...props}
    />
    {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
  </div>
);
