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
      className="p-4 bg-white/5 border border-white/10 rounded-xl cursor-pointer transition-colors hover:bg-white/8"
      onClick={() => onChange(!checked)}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium text-white text-sm">{label}</div>
          <div className="text-xs text-white/50">{description}</div>
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
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div
      className="flex items-center justify-between py-2 cursor-pointer group"
      onClick={() => onChange(!checked)}
    >
      <div className="flex-1">
        <div className="text-sm text-white group-hover:text-violet-300 transition-colors">
          {label}
        </div>
        {description && <div className="text-xs text-white/40">{description}</div>}
      </div>
      <Toggle checked={checked} onChange={onChange} color="violet" size="sm" />
    </div>
  );
}
