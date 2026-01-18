import React, { useState, useEffect } from 'react';
import { ChevronDown, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useDropdownDirection } from '@/hooks/useDropdownDirection';

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: React.ReactNode | string; disabled?: boolean }[];
  className?: string;
  icon?: React.ReactNode;
  placeholder?: string;
  forceDropUp?: boolean; // Force dropdown to always expand upward
}

import { Portal } from './Portal';

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  onChange,
  options,
  className = '',
  icon,
  placeholder,
  forceDropUp,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
    bottom: number;
  } | null>(null);
  const { ref: containerRef, getDirection } = useDropdownDirection<HTMLDivElement>();

  // Toggle open with smart direction detection
  const toggleOpen = () => {
    if (!isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        bottom: rect.bottom,
      });

      // If forceDropUp is set, use it; otherwise auto-detect
      if (forceDropUp !== undefined) {
        setDropUp(forceDropUp);
      } else {
        const { dropUp: shouldDropUp } = getDirection();
        setDropUp(shouldDropUp);
      }
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Check if click is on the trigger button (containerRef) - if so, toggleOpen handles it
      // If click is on the portal content (we need a ref for that? no, Portal content is distinct)
      // Actually, since Portal is outside, containerRef.contains(target) will be false for dropdown items.
      // But dropdown items have their own onClick that closes.
      // We only need to check if click is OUTSIDE both trigger AND dropdown.
      // Since dropdown is in Portal, we can't easily check "contains" via React ref hierarchy if it's not forwarded.
      // Workaround: Stop propagation on dropdown click?
      // Or relies on the fact that clicking trigger runs toggleOpen.
      // If I click outside, I want close.
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node) &&
        !(event.target as HTMLElement).closest('.custom-select-dropdown') // Marker class
      ) {
        setIsOpen(false);
      }
    };

    const handleScroll = () => {
      if (isOpen) setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', handleScroll);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [containerRef, isOpen]);

  const selectedLabel = options.find((opt) => opt.value === value)?.label || placeholder || value;

  return (
    <div className={cn('relative', className)} ref={containerRef}>
      <button
        type="button"
        onClick={toggleOpen}
        className="w-full flex items-center justify-between bg-white border border-slate-200 rounded-lg py-2 pl-3 pr-3 text-slate-700 focus:outline-none focus:border-brand-purple focus:ring-2 focus:ring-brand-purple/10 text-sm transition-all hover:bg-slate-50 hover:border-slate-300 shadow-sm"
      >
        <div className="flex items-center text-left overflow-hidden">
          {icon && <span className="mr-2 text-slate-400 shrink-0">{icon}</span>}
          <span className="block truncate font-medium">{selectedLabel}</span>
        </div>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-slate-400 transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && coords && (
        <Portal>
          <div
            className={cn(
              'custom-select-dropdown fixed z-50 bg-white border border-slate-200 rounded-lg shadow-xl shadow-slate-200/50 max-h-60 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-100'
            )}
            style={{
              left: coords.left,
              width: coords.width,
              top: dropUp ? undefined : coords.bottom + 4,
              bottom: dropUp ? window.innerHeight - coords.top + 4 : undefined,
            }}
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
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between',
                    option.disabled && 'opacity-40 cursor-not-allowed text-slate-400',
                    !option.disabled &&
                      value === option.value &&
                      'bg-brand-purple/10 text-brand-purple font-medium',
                    !option.disabled &&
                      value !== option.value &&
                      'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  )}
                >
                  <div className={typeof option.label === 'string' ? 'truncate' : ''}>
                    {option.label}
                  </div>
                  {value === option.value && !option.disabled && (
                    <CheckCircle className="w-3 h-3 text-brand-purple shrink-0 ml-2" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
};
