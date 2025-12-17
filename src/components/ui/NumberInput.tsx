import React, { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';

interface NumberInputProps {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  min?: number;
  max?: number;
  /** If set, use this value when input is empty on blur */
  defaultOnBlur?: number;
  allowDecimals?: boolean;
  placeholder?: string;
  className?: string;
}

/**
 * Generic number input component with min/max clamping.
 * Uses internal string state to allow typing decimals and empty values.
 */
export const NumberInput: React.FC<NumberInputProps> = ({
  value,
  onChange,
  min,
  max,
  defaultOnBlur,
  allowDecimals = false,
  placeholder = '',
  className = '',
}) => {
  // Internal string state for display - allows typing "23." or "" freely
  const [displayValue, setDisplayValue] = useState<string>(value?.toString() ?? '');
  const isFocusedRef = useRef(false);

  // Sync display value when external value changes (only when not focused)
  useEffect(() => {
    // Don't update while user is editing
    if (isFocusedRef.current) return;

    const externalStr = value?.toString() ?? '';
    setDisplayValue(externalStr);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;

    // Allow empty
    if (input === '') {
      setDisplayValue('');
      onChange(undefined);
      return;
    }

    // Validate pattern: allow in-progress typing like "." or "23." or "-"
    const pattern = allowDecimals ? /^-?\d*\.?\d*$/ : /^-?\d*$/;
    if (!pattern.test(input)) return;

    // Update display immediately
    setDisplayValue(input);

    // Only call onChange if it's a valid number
    const num = allowDecimals ? parseFloat(input) : parseInt(input, 10);
    if (!isNaN(num)) {
      // Don't clamp during typing - just validate range silently
      if (min !== undefined && num < min) return;
      if (max !== undefined && num > max) return;
      onChange(num);
    }
  };

  const handleFocus = () => {
    isFocusedRef.current = true;
  };

  const handleBlur = () => {
    isFocusedRef.current = false;

    // On blur, clamp and normalize the value
    if (displayValue === '' || displayValue === '.' || displayValue === '-') {
      // Use defaultOnBlur if provided, otherwise leave as undefined
      if (defaultOnBlur !== undefined) {
        setDisplayValue(defaultOnBlur.toString());
        onChange(defaultOnBlur);
      } else {
        setDisplayValue('');
        onChange(undefined);
      }
      return;
    }

    const num = allowDecimals ? parseFloat(displayValue) : parseInt(displayValue, 10);
    if (isNaN(num)) {
      setDisplayValue('');
      onChange(undefined);
      return;
    }

    let clamped = num;
    if (min !== undefined && clamped < min) clamped = min;
    if (max !== undefined && clamped > max) clamped = max;

    setDisplayValue(clamped.toString());
    onChange(clamped);
  };

  return (
    <input
      type="text"
      inputMode={allowDecimals ? 'decimal' : 'numeric'}
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={cn(
        'bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-indigo-500 text-sm',
        className
      )}
    />
  );
};
