import React from 'react';
import { Download, FileText, Film } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useTranslation } from 'react-i18next';
import type { AppSettings } from '@/types/settings';
import { HardwareAccelerationSelector } from '@/components/compression/HardwareAccelerationSelector';
import { ResolutionSelector } from '@/components/compression/ResolutionSelector';
import { EncoderSelector } from '@/components/compression/EncoderSelector';
import { useHardwareAcceleration } from '@/hooks/useHardwareAcceleration';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { NumberInput } from '@/components/ui/NumberInput';
import { ToggleOptionInline } from '@/components/endToEnd/wizard/shared/ToggleOption';
import { GenreSelectorInline } from '@/components/endToEnd/wizard/shared/GenreSelector';
import { DirectorySelector } from '@/components/ui/DirectorySelector';
import { QualitySelector } from '@/components/download/QualitySelector';
import { TargetLanguageSelector } from '@/components/settings/TargetLanguageSelector';

const SectionCard = ({
  title,
  icon,
  children,
  className,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) => (
  <Card
    className={cn(
      'bg-white/80 backdrop-blur-xl border-white/60 shadow-sm ring-1 ring-slate-900/5',
      className
    )}
  >
    <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-4 border-b border-slate-100 bg-slate-50/50">
      <div className="p-2 bg-white rounded-lg border border-slate-100 shadow-sm text-brand-purple">
        {icon}
      </div>
      <CardTitle className="text-base font-semibold text-slate-800">{title}</CardTitle>
    </CardHeader>
    <CardContent className="pt-6">{children}</CardContent>
  </Card>
);

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
  const { t } = useTranslation('endToEnd');
  const { hwAccelInfo } = useHardwareAcceleration();

  // 防抖选择目录处理函数 - 防止快速重复点击
  const handleSelectDir = useDebouncedCallback(async () => {
    if (window.electronAPI?.download?.selectDir) {
      const result = await window.electronAPI.download.selectDir();
      if (result.success && result.path) {
        onConfigChange({ outputDir: result.path });
      }
    }
  });

  return (
    <div className="max-w-3xl mx-auto">
      {/* Video Info Card */}
      {videoInfo && (
        <Card className="mb-6 bg-white border-slate-200 shadow-sm ring-1 ring-slate-900/5">
          <CardContent className="p-4 flex items-center gap-4">
            {videoInfo.thumbnail && (
              <img
                src={videoInfo.thumbnail}
                alt="Thumbnail"
                className="w-20 h-14 object-cover rounded-lg border border-slate-100"
              />
            )}
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-slate-800 truncate">{videoInfo.title}</h4>
              <p className="text-sm text-slate-500">{videoInfo.uploader}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-6">
        {/* ================================ */}
        {/* ================================ */}
        {/* Section 1: 下载配置 */}
        {/* ================================ */}
        <SectionCard title={t('config.sections.download')} icon={<Download className="w-4 h-4" />}>
          {/* Output Directory */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {t('config.download.outputDir')}
            </label>
            <DirectorySelector
              value={config.outputDir || ''}
              placeholder={t('config.download.placeholder')}
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
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t('config.download.quality')}
              </label>
              <div className="flex flex-wrap gap-2 md:gap-3">
                {[
                  { value: 'best', label: t('config.download.best') },
                  { value: '1080p', label: '1080p' },
                  { value: '720p', label: '720p' },
                  { value: '480p', label: '480p' },
                ].map((quality) => (
                  <button
                    key={quality.value}
                    onClick={() => onConfigChange({ downloadFormat: quality.value })}
                    className={cn(
                      'px-4 py-2 rounded-lg text-sm transition-colors border shadow-sm',
                      (config.downloadFormat || 'best') === quality.value
                        ? 'bg-brand-purple/10 border-brand-purple/20 text-brand-purple font-medium'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
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
            label={t('config.download.cover')}
            checked={config.downloadThumbnail !== false}
            onChange={(v) => onConfigChange({ downloadThumbnail: v })}
          />
        </SectionCard>

        {/* ================================ */}
        {/* Section 2: 字幕生成配置 */}
        {/* ================================ */}
        <SectionCard title={t('config.sections.subtitle')} icon={<FileText className="w-4 h-4" />}>
          {/* Genre Selection */}

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {t('config.subtitle.genre')}
            </label>
            <GenreSelectorInline
              currentGenre={config.genre || 'anime'}
              onGenreChange={(genre) => onConfigChange({ genre })}
            />
          </div>

          {/* Target Language */}
          <div className="flex items-center justify-between py-2">
            <div>
              <span className="text-sm text-slate-700 font-medium">
                {t('config.subtitle.targetLanguage.label')}
              </span>
              <p className="text-xs text-slate-500">{t('config.subtitle.targetLanguage.desc')}</p>
            </div>
            <div className="w-40">
              <TargetLanguageSelector
                value={config.targetLanguage}
                onChange={(val) => onConfigChange({ targetLanguage: val })}
                variant="inline"
              />
            </div>
          </div>

          {/* Glossary & Speaker Detection */}
          <div className="space-y-2">
            {/* Glossary Selection */}
            <div className="flex items-center justify-between py-2">
              <div>
                <span className="text-sm text-slate-700 font-medium">
                  {t('config.subtitle.glossary.label')}
                </span>
                <p className="text-xs text-slate-500">{t('config.subtitle.glossary.desc')}</p>
              </div>
              <div className="w-40">
                <CustomSelect
                  value={config.selectedGlossaryId || ''}
                  onChange={(val: string) => onConfigChange({ selectedGlossaryId: val || null })}
                  options={[
                    { value: '', label: t('config.subtitle.glossary.none') },
                    ...(settings?.glossaries?.map((g) => ({
                      value: g.id,
                      label: (
                        <div className="flex items-center justify-between w-full min-w-0">
                          <span className="truncate mr-2">{g.name}</span>
                          <span className="text-slate-500 text-xs shrink-0">
                            ({g.terms?.length || 0})
                          </span>
                        </div>
                      ),
                    })) || []),
                  ]}
                  placeholder={t('config.subtitle.glossary.none')}
                />
              </div>
            </div>
            {/* Auto-confirm hint - always show */}
            <p className="text-xs text-brand-purple/70 mt-1 pl-0.5">
              {config.selectedGlossaryId
                ? t('config.subtitle.glossary.autoConfirmHint')
                : t('config.subtitle.glossary.noGlossaryHint')}
            </p>

            {/* Speaker Count - Only visible if Global Diarization is enabled */}
            {settings?.enableDiarization && (
              <div className="pt-3 border-t border-slate-100 mt-2">
                <span className="text-sm text-slate-700 font-medium block mb-2">
                  {t('config.subtitle.speakerCount.label')}
                </span>
                <div className="flex flex-wrap items-center gap-4 md:gap-6">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-500">
                      {t('config.subtitle.speakerCount.min')}
                    </span>
                    <NumberInput
                      value={config.minSpeakers}
                      onChange={(v) => onConfigChange({ minSpeakers: v })}
                      min={1}
                      max={99}
                      placeholder="-"
                      className="w-12 text-center bg-white border-slate-200 focus:border-brand-purple/50 text-slate-700"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-500">
                      {t('config.subtitle.speakerCount.max')}
                    </span>
                    <NumberInput
                      value={config.maxSpeakers}
                      onChange={(v) => onConfigChange({ maxSpeakers: v })}
                      min={1}
                      max={99}
                      placeholder="-"
                      className="w-12 text-center bg-white border-slate-200 focus:border-brand-purple/50 text-slate-700"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </SectionCard>

        {/* ================================ */}
        {/* Section 3: 压制配置 */}
        {/* ================================ */}
        <SectionCard title={t('config.sections.compression')} icon={<Film className="w-4 h-4" />}>
          <ToggleOptionInline
            label={t('config.compression.enable.label')}
            description={t('config.compression.enable.desc')}
            checked={config.enableCompression !== false}
            onChange={(v) => onConfigChange({ enableCompression: v })}
          />

          {config.enableCompression !== false && (
            <div className="mt-6 space-y-6 pl-2">
              {/* Hardware Acceleration */}
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <label className="w-24 text-sm font-medium text-slate-700 shrink-0">
                  {t('config.compression.hwAccel')}
                </label>
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
                <label className="w-24 text-sm font-medium text-slate-700 shrink-0">
                  {t('config.compression.encoder')}
                </label>
                <div className="flex-1">
                  <EncoderSelector
                    value={config.compressionEncoder || 'libx264'}
                    onChange={(v: string) => onConfigChange({ compressionEncoder: v })}
                  />
                </div>
              </div>

              {/* Resolution Select */}
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <label className="w-24 text-sm font-medium text-slate-700 shrink-0">
                  {t('config.compression.resolution')}
                </label>
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
                <label className="w-24 text-sm font-medium text-slate-700 shrink-0">
                  {t('config.compression.crf.label')}
                </label>
                <div className="flex-1 space-y-2">
                  <NumberInput
                    value={config.compressionCrf ?? 23}
                    onChange={(v) => onConfigChange({ compressionCrf: v ?? 23 })}
                    min={0}
                    max={51}
                    allowDecimals={true}
                    className="w-full bg-white border-slate-200 text-slate-700"
                  />
                  <div className="text-xs text-slate-500">{t('config.compression.crf.desc')}</div>
                </div>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
