import React from 'react';
import { cn } from '@/lib/cn';
import { CustomSelect } from '../settings/CustomSelect';
import { NumberInput } from '../ui/NumberInput';

export type ResolutionOption = 'original' | '1080p' | '720p' | '480p' | 'custom';

interface ResolutionSelectorProps {
  resolution: ResolutionOption;
  width?: number;
  height?: number;
  onChange: (resolution: ResolutionOption, width?: number, height?: number) => void;
  className?: string;
}

export const ResolutionSelector: React.FC<ResolutionSelectorProps> = ({
  resolution,
  width,
  height,
  onChange,
  className = '',
}) => {
  return (
    <div className={cn('space-y-3 md:space-y-4', className)}>
      <CustomSelect
        value={resolution}
        onChange={(val) => {
          // preserve existing width/height when switching modes, just update resolution
          onChange(val as ResolutionOption, width, height);
        }}
        options={[
          {
            value: 'original',
            label: (
              <div>
                <div className="font-medium text-slate-200">原始分辨率</div>
                <div className="text-xs text-slate-500">保持原始分辨率</div>
              </div>
            ),
          },
          {
            value: '1080p',
            label: (
              <div>
                <div className="font-medium text-slate-200">1080P</div>
                <div className="text-xs text-slate-500">1920x1080 - 全高清</div>
              </div>
            ),
          },
          {
            value: '720p',
            label: (
              <div>
                <div className="font-medium text-slate-200">720P</div>
                <div className="text-xs text-slate-500">1280x720 - 高清</div>
              </div>
            ),
          },
          {
            value: '480p',
            label: (
              <div>
                <div className="font-medium text-slate-200">480P</div>
                <div className="text-xs text-slate-500">854x480 - 标清</div>
              </div>
            ),
          },
          {
            value: 'custom',
            label: (
              <div>
                <div className="font-medium text-slate-200">自定义</div>
                <div className="text-xs text-slate-500">手动输入宽高</div>
              </div>
            ),
          },
        ]}
      />

      {resolution === 'custom' && (
        <div className="flex flex-row gap-4 animate-fade-in">
          <div className="relative flex-1">
            <NumberInput
              value={width}
              onChange={(v) => onChange(resolution, v, height)}
              placeholder="宽"
              className="w-full pl-4 pr-8 transition-all"
            />
            <span className="absolute right-3 top-2.5 text-xs text-slate-500 pointer-events-none">
              W
            </span>
          </div>
          <div className="relative flex-1">
            <NumberInput
              value={height}
              onChange={(v) => onChange(resolution, width, v)}
              placeholder="高"
              className="w-full pl-4 pr-8 transition-all"
            />
            <span className="absolute right-3 top-2.5 text-xs text-slate-500 pointer-events-none">
              H
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
