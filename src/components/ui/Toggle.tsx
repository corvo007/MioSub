import React from 'react';

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
    knobChecked: 'left-6',
    knobUnchecked: 'left-1',
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
  const usesTransform = size === 'sm' || size === 'lg';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`${sizeConfig.track} rounded-full transition-colors relative ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${checked ? colorClasses[color] : size === 'md' ? 'bg-slate-600' : 'bg-white/20'}`}
    >
      <div
        className={`absolute ${sizeConfig.knobTop} ${sizeConfig.knob} rounded-full bg-white transition-transform ${
          usesTransform ? (checked ? sizeConfig.knobChecked : sizeConfig.knobUnchecked) : ''
        }`}
        style={
          !usesTransform
            ? { left: checked ? sizeConfig.knobChecked : sizeConfig.knobUnchecked }
            : undefined
        }
      />
    </button>
  );
};
