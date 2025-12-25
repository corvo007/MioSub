import React from 'react';
import { useTranslation } from 'react-i18next';
import { CustomSelect } from '@/components/settings/CustomSelect';

interface EncoderSelectorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export const EncoderSelector: React.FC<EncoderSelectorProps> = ({ value, onChange, className }) => {
  const { t } = useTranslation('ui');

  return (
    <CustomSelect
      value={value || 'libx264'}
      onChange={onChange}
      className={className}
      options={[
        {
          value: 'libx264',
          label: (
            <div className="text-left whitespace-normal break-words">
              <div className="font-medium text-slate-200">H.264 (AVC)</div>
              <div className="text-xs text-slate-500">{t('encoderSelector.h264Desc')}</div>
            </div>
          ),
        },
        {
          value: 'libx265',
          label: (
            <div className="text-left whitespace-normal break-words">
              <div className="font-medium text-slate-200">H.265 (HEVC)</div>
              <div className="text-xs text-slate-500">{t('encoderSelector.hevcDesc')}</div>
            </div>
          ),
        },
      ]}
    />
  );
};
