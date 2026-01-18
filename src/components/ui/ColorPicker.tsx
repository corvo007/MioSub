import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { HexColorPicker } from 'react-colorful';
import { cn } from '@/lib/cn';
import { SPEAKER_COLORS } from '@/services/utils/colors';

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  className?: string;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({ color, onChange, className }) => {
  const { t } = useTranslation('common');
  // 确保颜色值有效，如果是空字符串则默认为白色
  const validColor = useMemo(() => {
    return color || '#ffffff';
  }, [color]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase();
    // 验证是否为有效的 hex 字符（不包含 #）
    if (/^[0-9A-F]{0,6}$/.test(value)) {
      onChange(`#${value}`);
    }
  };

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-col items-center">
        <HexColorPicker
          color={validColor}
          onChange={onChange}
          style={{ width: '100%', height: '160px' }}
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-500">{t('presetColors')}</label>
        <div className="grid grid-cols-8 gap-2">
          {SPEAKER_COLORS.map((presetColor) => (
            <button
              key={presetColor}
              onClick={() => onChange(presetColor)}
              className={cn(
                'w-6 h-6 rounded-full border transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-indigo-500/50',
                color.toLowerCase() === presetColor.toLowerCase()
                  ? 'border-white ring-2 ring-brand-purple shadow-md scale-110'
                  : 'border-transparent hover:border-slate-300 hover:scale-110'
              )}
              style={{ backgroundColor: presetColor }}
              title={presetColor}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div
          className="w-10 h-10 rounded-lg border border-slate-200 shadow-sm shrink-0"
          style={{ backgroundColor: validColor }}
        />
        <div className="flex-1">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
              #
            </span>
            <input
              type="text"
              value={validColor.replace('#', '')}
              onChange={handleInputChange}
              className="w-full bg-white border border-slate-300 rounded-lg py-2 pl-7 pr-3 text-sm text-slate-800 placeholder-slate-400 focus:border-brand-purple focus:outline-none focus:ring-1 focus:ring-brand-purple/20 transition-colors uppercase"
              placeholder="FFFFFF"
              maxLength={6}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
