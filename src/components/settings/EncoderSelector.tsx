import React from 'react';
import { CustomSelect } from '@/components/settings/CustomSelect';

interface EncoderSelectorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export const EncoderSelector: React.FC<EncoderSelectorProps> = ({ value, onChange, className }) => {
  return (
    <CustomSelect
      value={value || 'libx264'}
      onChange={onChange}
      className={className}
      options={[
        {
          value: 'libx264',
          label: (
            <div className="text-left">
              <div className="font-medium text-slate-200">H.264 (AVC)</div>
              <div className="text-xs text-slate-500">兼容性最好，适合大多数场景</div>
            </div>
          ),
        },
        {
          value: 'libx265',
          label: (
            <div className="text-left">
              <div className="font-medium text-slate-200">H.265 (HEVC)</div>
              <div className="text-xs text-slate-500">高压缩率，同画质体积更小</div>
            </div>
          ),
        },
      ]}
    />
  );
};
