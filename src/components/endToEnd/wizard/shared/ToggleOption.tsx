import React from 'react';
import { Toggle } from '@/components/ui/Toggle';

/** 切换选项组件 */
export function ToggleOption({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div
      className="p-4 bg-white border border-slate-200 rounded-xl cursor-pointer transition-colors hover:bg-slate-50 shadow-sm"
      onClick={() => onChange(!checked)}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium text-slate-700 text-sm">{label}</div>
          <div className="text-xs text-slate-500">{description}</div>
        </div>
        <Toggle checked={checked} onChange={onChange} color="violet" size="lg" />
      </div>
    </div>
  );
}

/** 行内切换选项（更紧凑） */
export function ToggleOptionInline({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between py-2 group ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      }`}
      onClick={() => !disabled && onChange(!checked)}
    >
      <div className="flex-1">
        <div
          className={`text-sm text-slate-700 ${
            disabled ? '' : 'group-hover:text-brand-purple'
          } transition-colors`}
        >
          {label}
        </div>
        {description && <div className="text-xs text-slate-500">{description}</div>}
      </div>
      <Toggle checked={checked} onChange={onChange} color="violet" size="md" disabled={disabled} />
    </div>
  );
}
