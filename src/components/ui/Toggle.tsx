import React from 'react';
import { cn } from '@/lib/cn';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  color?: 'indigo' | 'violet' | 'emerald' | 'amber';
  size?: 'sm' | 'md' | 'lg';
}

const colorClasses = {
  indigo: 'bg-indigo-500',
  violet: 'bg-violet-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
};

const sizeClasses = {
  sm: {
    track: 'w-9 h-5',
    knob: 'w-4 h-4',
    knobChecked: 'translate-x-4',
    knobUnchecked: 'translate-x-0.5',
    knobTop: 'top-0.5',
  },
  md: {
    track: 'w-10 h-5',
    knob: 'w-3 h-3',
    knobChecked: 'translate-x-6',
    knobUnchecked: 'translate-x-1',
    knobTop: 'top-1',
  },
  lg: {
    track: 'w-10 h-6',
    knob: 'w-4 h-4',
    knobChecked: 'translate-x-5',
    knobUnchecked: 'translate-x-1',
    knobTop: 'top-1',
  },
};

export const Toggle: React.FC<ToggleProps> = ({
  checked,
  onChange,
  disabled = false,
  color = 'indigo',
  size = 'md',
}) => {
  const sizeConfig = sizeClasses[size];

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        sizeConfig.track,
        'rounded-full transition-colors relative',
        disabled && 'opacity-50 cursor-not-allowed',
        checked ? colorClasses[color] : 'bg-slate-200 hover:bg-slate-300'
      )}
    >
      <div
        className={cn(
          'absolute',
          sizeConfig.knobTop,
          sizeConfig.knob,
          'rounded-full bg-white transition-transform duration-200',
          checked ? sizeConfig.knobChecked : sizeConfig.knobUnchecked
        )}
      />
    </button>
  );
};
