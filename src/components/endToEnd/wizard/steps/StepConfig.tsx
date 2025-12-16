import React from 'react';
import { Download, FileText, Film } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { AppSettings } from '@/types/settings';
import { HardwareAccelerationSelector } from '@/components/settings/HardwareAccelerationSelector';
import { ResolutionSelector } from '@/components/settings/ResolutionSelector';
import { EncoderSelector } from '@/components/settings/EncoderSelector';
import { useHardwareAcceleration } from '@/hooks/useHardwareAcceleration';
import { CustomSelect } from '@/components/settings/CustomSelect';
import { Card } from '@/components/ui/Card';
import { NumberInput } from '@/components/ui/NumberInput';
import { ToggleOptionInline } from '@/components/endToEnd/wizard/shared/ToggleOption';
import { GenreSelectorInline } from '@/components/endToEnd/wizard/shared/GenreSelector';
import { DirectorySelector } from '@/components/ui/DirectorySelector';
import { QualitySelector } from '@/components/download/QualitySelector';

/** 步骤 2: 配置选项 */
export function StepConfig({
  config,
  onConfigChange,
  videoInfo,
  settings,
}: {
  config: any;
  onConfigChange: (updates: any) => void;
  videoInfo?: any;
  settings?: AppSettings;
}) {
  const { hwAccelInfo } = useHardwareAcceleration();

  const handleSelectDir = async () => {
    if (window.electronAPI?.download?.selectDir) {
      const result = await window.electronAPI.download.selectDir();
      if (result.success && result.path) {
        onConfigChange({ outputDir: result.path });
      }
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Video Info Card */}
      {videoInfo && (
        <Card className="mb-6">
          <div className="flex items-center gap-4">
            {videoInfo.thumbnail && (
              <img
                src={videoInfo.thumbnail}
                alt="Thumbnail"
                className="w-20 h-14 object-cover rounded-lg"
              />
            )}
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-white truncate">{videoInfo.title}</h4>
              <p className="text-sm text-white/50">{videoInfo.uploader}</p>
            </div>
          </div>
        </Card>
      )}

      <div className="space-y-6">
        {/* ================================ */}
        {/* Section 1: 下载配置 */}
        {/* ================================ */}
        <Card title="下载配置" icon={<Download className="w-4 h-4" />}>
          {/* Output Directory */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-white/70 mb-2">输出目录</label>
            <DirectorySelector
              value={config.outputDir || ''}
              placeholder="未选择"
              onSelect={handleSelectDir}
              variant="accent"
            />
          </div>

          {/* Video Quality */}
          {videoInfo?.formats?.length > 0 ? (
            <QualitySelector
              formats={videoInfo.formats}
              selectedFormat={config.downloadFormat || videoInfo.formats[0]?.formatId}
              onSelect={(formatId) => onConfigChange({ downloadFormat: formatId })}
              className="mb-4"
            />
          ) : (
            <div className="mb-4">
              <label className="block text-sm font-medium text-white/70 mb-2">画质选择</label>
              <div className="flex flex-wrap gap-2 md:gap-3">
                {[
                  { value: 'best', label: '最佳' },
                  { value: '1080p', label: '1080p' },
                  { value: '720p', label: '720p' },
                  { value: '480p', label: '480p' },
                ].map((quality) => (
                  <button
                    key={quality.value}
                    onClick={() => onConfigChange({ downloadFormat: quality.value })}
                    className={cn(
                      'px-4 py-2 rounded-lg text-sm transition-colors border',
                      (config.downloadFormat || 'best') === quality.value
                        ? 'bg-violet-500/20 border-violet-500/50 text-violet-400'
                        : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'
                    )}
                  >
                    {quality.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Download Thumbnail */}
          <ToggleOptionInline
            label="下载封面"
            checked={config.downloadThumbnail !== false}
            onChange={(v) => onConfigChange({ downloadThumbnail: v })}
          />
        </Card>

        {/* ================================ */}
        {/* Section 2: 字幕生成配置 */}
        {/* ================================ */}
        <Card title="字幕生成配置" icon={<FileText className="w-4 h-4" />}>
          {/* Genre Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-white/70 mb-2">内容类型</label>
            <GenreSelectorInline
              currentGenre={config.genre || 'anime'}
              onGenreChange={(genre) => onConfigChange({ genre })}
            />
          </div>

          {/* Glossary & Speaker Detection */}
          <div className="space-y-2">
            <ToggleOptionInline
              label="启用自动术语表"
              description="提取术语后直接应用，无需人工确认。新术语将自动合并至当前激活的术语表（如当前无术语表，则自动新建）。"
              checked={config.enableGlossary !== false}
              onChange={(v) => onConfigChange({ enableGlossary: v })}
            />

            {/* Glossary Selection */}
            <div className="flex items-center justify-between py-2">
              <div>
                <span className="text-sm text-white/90">使用术语表</span>
                <p className="text-xs text-white/50">选择已有的术语表辅助翻译</p>
              </div>
              <div className="w-40">
                <CustomSelect
                  value={config.selectedGlossaryId || ''}
                  onChange={(val: string) => onConfigChange({ selectedGlossaryId: val || null })}
                  options={[
                    { value: '', label: '(无)' },
                    ...(settings?.glossaries?.map((g) => ({
                      value: g.id,
                      label: (
                        <div className="flex items-center justify-between w-full min-w-0">
                          <span className="truncate mr-2">{g.name}</span>
                          <span className="text-slate-500 text-xs flex-shrink-0">
                            ({g.terms?.length || 0})
                          </span>
                        </div>
                      ),
                    })) || []),
                  ]}
                  placeholder="(无)"
                />
              </div>
            </div>

            <ToggleOptionInline
              label="启用说话人区分"
              description="识别音频或视频中的不同说话人，打上标签"
              checked={config.enableDiarization !== false}
              onChange={(v) => onConfigChange({ enableDiarization: v })}
            />

            {config.enableDiarization !== false && (
              <div className="ml-8 mt-1 space-y-2 border-l-2 border-white/10 pl-3">
                <ToggleOptionInline
                  label="启用说话人预分析 (实验性)"
                  description="在生成字幕前预先分析音频以识别说话人数量和声音特征，可提高区分准确度，但会增加耗时"
                  checked={!!config.enableSpeakerPreAnalysis}
                  onChange={(v) => onConfigChange({ enableSpeakerPreAnalysis: v })}
                />
                <ToggleOptionInline
                  label="导出时包含说话人名称"
                  description="在字幕文件中显示说话人（如：羊宫妃那：对话内容）"
                  checked={!!config.includeSpeaker}
                  onChange={(v) => onConfigChange({ includeSpeaker: v })}
                />
                <ToggleOptionInline
                  label="使用说话人颜色 (ASS)"
                  description="为不同说话人分配不同颜色（仅 ASS 格式有效）"
                  checked={!!config.useSpeakerColors}
                  onChange={(v) => onConfigChange({ useSpeakerColors: v })}
                />
                <ToggleOptionInline
                  label="角色风格化翻译"
                  description="根据说话人特征调整翻译语气（正式/口语）"
                  checked={!!config.useSpeakerStyledTranslation}
                  onChange={(v) => onConfigChange({ useSpeakerStyledTranslation: v })}
                />
                {/* Min/Max Speaker Count */}
                <div className="pt-3">
                  <span className="text-sm text-white/90 block mb-2">说话人数量 (可选)</span>
                  <div className="flex flex-wrap items-center gap-4 md:gap-6">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-white/70">最少说话人</span>
                      <NumberInput
                        value={config.minSpeakers}
                        onChange={(v) => onConfigChange({ minSpeakers: v })}
                        min={1}
                        max={99}
                        placeholder="-"
                        className="w-12 text-center bg-white/5 border-white/10 focus:border-violet-500/50"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-white/70">最多说话人</span>
                      <NumberInput
                        value={config.maxSpeakers}
                        onChange={(v) => onConfigChange({ maxSpeakers: v })}
                        min={1}
                        max={99}
                        placeholder="-"
                        className="w-12 text-center bg-white/5 border-white/10 focus:border-violet-500/50"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* ================================ */}
        {/* Section 3: 压制配置 */}
        {/* ================================ */}
        <Card title="视频压制配置" icon={<Film className="w-4 h-4" />}>
          <ToggleOptionInline
            label="启用视频压制"
            description="高性能 H.264/H.265 视频编码与字幕内嵌"
            checked={config.enableCompression !== false}
            onChange={(v) => onConfigChange({ enableCompression: v })}
          />

          {config.enableCompression !== false && (
            <div className="mt-6 space-y-6 pl-2">
              {/* Hardware Acceleration */}
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <label className="w-24 text-sm font-medium text-white/70 shrink-0">硬件加速</label>
                <div className="flex-1">
                  <HardwareAccelerationSelector
                    hwAccelInfo={hwAccelInfo}
                    enabled={config.useHardwareAccel !== false}
                    onToggle={() =>
                      onConfigChange({ useHardwareAccel: !(config.useHardwareAccel !== false) })
                    }
                    encoder={config.compressionEncoder || 'libx264'}
                  />
                </div>
              </div>

              {/* Encoder */}
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <label className="w-24 text-sm font-medium text-white/70 shrink-0">编码器</label>
                <div className="flex-1">
                  <EncoderSelector
                    value={config.compressionEncoder || 'libx264'}
                    onChange={(v: string) => onConfigChange({ compressionEncoder: v })}
                  />
                </div>
              </div>

              {/* Resolution Select */}
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <label className="w-24 text-sm font-medium text-white/70 shrink-0">分辨率</label>
                <div className="flex-1">
                  <ResolutionSelector
                    resolution={config.compressionResolution || 'original'}
                    width={config.compressionWidth}
                    height={config.compressionHeight}
                    onChange={(res, w, h) =>
                      onConfigChange({
                        compressionResolution: res,
                        compressionWidth: w,
                        compressionHeight: h,
                      })
                    }
                  />
                </div>
              </div>

              {/* CRF Input */}
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <label className="w-24 text-sm font-medium text-white/70 shrink-0">
                  质量 (CRF)
                </label>
                <div className="flex-1 space-y-2">
                  <NumberInput
                    value={config.compressionCrf ?? 23}
                    onChange={(v) => onConfigChange({ compressionCrf: v ?? 23 })}
                    min={0}
                    max={51}
                    allowDecimals={true}
                    className="w-full font-mono"
                  />
                  <div className="text-xs text-slate-500">
                    范围 0-51，数值越小画质越高。推荐：H.264 (23), H.265 (28)
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
