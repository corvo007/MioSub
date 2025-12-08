import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, CheckCircle } from 'lucide-react';

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: React.ReactNode | string; disabled?: boolean }[];
  className?: string;
  icon?: React.ReactNode;
  placeholder?: string;
  direction?: 'up' | 'down';
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  onChange,
  options,
  className = '',
  icon,
  placeholder,
  direction = 'down',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedLabel = options.find((opt) => opt.value === value)?.label || placeholder || value;

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between bg-slate-800 border border-slate-700 rounded-lg py-2 pl-3 pr-3 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm transition-colors hover:bg-slate-750"
      >
        <div className="flex items-center text-left overflow-hidden">
          {icon && <span className="mr-2 text-slate-500 shrink-0">{icon}</span>}
          <span className="block truncate">{selectedLabel}</span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute z-50 w-full bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-60 overflow-y-auto custom-scrollbar animate-fade-in ${
            direction === 'up' ? 'bottom-full mb-1' : 'mt-1'
          }`}
        >
          <div className="p-1">
            {options.map((option) => (
              <button
                key={option.value}
                disabled={option.disabled}
                onClick={() => {
                  if (!option.disabled) {
                    onChange(option.value);
                    setIsOpen(false);
                  }
                }}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between ${
                  option.disabled
                    ? 'opacity-40 cursor-not-allowed text-slate-500'
                    : value === option.value
                      ? 'bg-indigo-600/20 text-indigo-300'
                      : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                <div className={typeof option.label === 'string' ? 'truncate' : ''}>
                  {option.label}
                </div>
                {value === option.value && !option.disabled && (
                  <CheckCircle className="w-3 h-3 text-indigo-400 shrink-0 ml-2" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
