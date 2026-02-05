/**
 * Download Page - Main Component (Tailwind CSS Version)
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileText,
  Settings,
  Download,
  Play,
  CheckCircle,
  FolderOpen,
  RefreshCw,
  X,
  Image,
} from 'lucide-react';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { DirectorySelector } from '@/components/ui/DirectorySelector';
import { useDownload } from '@/hooks/useDownload';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { UrlInput } from '@/components/download/UrlInput';
import { VideoPreview } from '@/components/download/VideoPreview';
import { QualitySelector } from '@/components/download/QualitySelector';
import { DownloadProgress } from '@/components/download/DownloadProgress';
import { PageHeader, HeaderButton } from '@/components/layout/PageHeader';
import { HelpButton } from '@/components/layout/HelpButton';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/cn';

interface DownloadPageProps {
  onDownloadComplete?: (videoPath: string) => void;
  onGoBack?: () => void;
}

export function DownloadPage({ onDownloadComplete, onGoBack }: DownloadPageProps) {
  // Store actions
  const setShowLogs = useAppStore((s) => s.setShowLogs);
  const setShowSettings = useAppStore((s) => s.setShowSettings);

  const {
    status,
    videoInfo,
    progress,
    outputDir,
    error,
    errorInfo,
    outputPath,
    thumbnailPath,
    parse,
    download,
    downloadThumbnail,
    cancel,
    selectDir,
    reset,
    retry,
  } = useDownload();

  const { t } = useTranslation('download');
  const [selectedFormat, setSelectedFormat] = useState<string>('');
  const [includeThumbnail, setIncludeThumbnail] = useState<boolean>(false);
  const [downloadingThumbnail, setDownloadingThumbnail] = useState<boolean>(false);

  // Auto-select first format when video info is available
  React.useEffect(() => {
    if (videoInfo?.formats?.length && !selectedFormat) {
      setSelectedFormat(videoInfo.formats[0].quality);
    }
  }, [videoInfo, selectedFormat]);

  // 防抖下载处理函数 - 防止快速重复点击
  const handleDownload = useDebouncedCallback(async () => {
    if (selectedFormat) {
      const path = await download(selectedFormat);
      // Download thumbnail if option is enabled
      if (path && includeThumbnail) {
        await downloadThumbnail();
      }
    }
  });

  const handleDownloadAndContinue = useDebouncedCallback(async () => {
    if (selectedFormat) {
      const path = await download(selectedFormat);
      // Download thumbnail if option is enabled
      if (path && includeThumbnail) {
        await downloadThumbnail();
      }
      if (path && onDownloadComplete) {
        onDownloadComplete(path);
      }
    }
  });

  const handleDownloadThumbnailOnly = useDebouncedCallback(async () => {
    if (!videoInfo) return;
    setDownloadingThumbnail(true);
    try {
      await downloadThumbnail();
    } finally {
      setDownloadingThumbnail(false);
    }
  });

  const getErrorIcon = () => {
    const iconMap: Record<string, string> = {
      network: '🌐',
      rate_limit: '⏳',
      geo_blocked: '🌍',
      private: '🔒',
      paid: '💰',
      login_required: '🔐',
      age_restricted: '🔞',
      unavailable: '🚫',
      unsupported: '⚠️',
      format_unavailable: '📺',
      invalid_url: '🔗',
    };
    return iconMap[errorInfo?.type || ''] || '❌';
  };

  return (
    <div className="h-screen overflow-hidden bg-warm-mesh flex flex-col p-4 md:p-8">
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col min-h-0">
        {/* Header */}
        <PageHeader
          title={t('title')}
          subtitle={t('subtitle')}
          onBack={onGoBack}
          actions={
            <>
              <HeaderButton
                onClick={() => setShowLogs(true)}
                icon={<FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                label={t('logs')}
                title={t('viewLogs')}
                hoverColor="blue"
              />
              <HeaderButton
                onClick={() => setShowSettings(true)}
                icon={<Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                label={t('settings')}
                hoverColor="emerald"
              />
              <HelpButton />
            </>
          }
        />

        <div className="max-w-3xl mx-auto w-full mt-6 overflow-y-auto custom-scrollbar pr-2 pb-4">
          <UrlInput
            onParse={parse}
            disabled={status === 'downloading' || status === 'parsing'}
            loading={status === 'parsing'}
          />

          {/* Error Message */}
          {error && (
            <div
              className={cn(
                'flex flex-col gap-3 p-4 rounded-xl mb-4 border shadow-sm',
                errorInfo?.retryable
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              )}
            >
              <div className="flex items-start gap-3">
                <span className="text-xl shrink-0">{getErrorIcon()}</span>
                <span className="leading-relaxed font-medium">{error}</span>
              </div>
              <div className="flex gap-2 justify-end">
                {errorInfo?.retryable && (
                  <button
                    onClick={retry}
                    className="px-3 py-1.5 bg-violet-50 border border-violet-200 rounded-lg text-violet-700 text-sm transition-colors hover:bg-violet-100 font-medium"
                  >
                    <span className="flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5" /> {t('retry')}
                    </span>
                  </button>
                )}
                <button
                  onClick={reset}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-600 text-sm transition-colors hover:bg-slate-50 font-medium shadow-sm"
                >
                  <span className="flex items-center gap-1.5">
                    <X className="w-3.5 h-3.5" /> {t('clear')}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Video Card */}
          {videoInfo && status !== 'downloading' && status !== 'completed' && (
            <div className="bg-white/80 backdrop-blur-xl border border-white/20 rounded-2xl p-6 shadow-xl shadow-slate-200/40 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <VideoPreview videoInfo={videoInfo} />

              <div className="my-6">
                <QualitySelector
                  formats={videoInfo.formats}
                  selectedFormat={selectedFormat}
                  onSelect={setSelectedFormat}
                />
              </div>

              {/* Output Directory */}
              <div className="pt-6 mb-6 border-t border-slate-100">
                <label className="block text-sm font-semibold text-slate-600 mb-2">
                  {t('outputDir')}
                </label>
                <DirectorySelector
                  value={outputDir}
                  placeholder={t('notSelected')}
                  onSelect={selectDir}
                  variant="default"
                />
              </div>

              {/* Download Thumbnail Option (Custom Checkbox) */}
              <div className="mb-8">
                <div
                  className="flex items-center gap-2 cursor-pointer select-none group w-fit"
                  onClick={() => setIncludeThumbnail(!includeThumbnail)}
                >
                  <div
                    className={cn(
                      'w-5 h-5 rounded flex items-center justify-center transition-all duration-200 border shadow-sm',
                      includeThumbnail
                        ? 'bg-brand-purple border-brand-purple'
                        : 'bg-white border-slate-300 group-hover:border-brand-purple/50'
                    )}
                  >
                    {includeThumbnail && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                  </div>
                  <span
                    className={cn(
                      'text-sm transition-colors font-medium',
                      includeThumbnail
                        ? 'text-slate-800'
                        : 'text-slate-600 group-hover:text-slate-800'
                    )}
                  >
                    {t('downloadThumbnail')}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-4 justify-end pt-6 border-t border-slate-100">
                {/* Standalone Thumbnail Download Button */}
                <button
                  onClick={handleDownloadThumbnailOnly}
                  disabled={downloadingThumbnail}
                  className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-600 font-semibold transition-all hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 shadow-sm mr-auto"
                >
                  <span className="flex items-center gap-2">
                    {downloadingThumbnail ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Image className="w-4 h-4 text-slate-500" />
                    )}
                    {t('thumbnailOnly')}
                  </span>
                </button>

                <button
                  onClick={handleDownload}
                  className="px-6 py-3 bg-white border border-slate-200 rounded-xl text-slate-700 font-bold transition-all hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 shadow-sm"
                >
                  <span className="flex items-center gap-2">
                    <Download className="w-4 h-4" /> {t('downloadVideo')}
                  </span>
                </button>
                <PrimaryButton
                  onClick={handleDownloadAndContinue}
                  icon={<Play className="w-4 h-4 fill-current" />}
                  className="rounded-xl shadow-lg shadow-brand-purple/20"
                >
                  {t('downloadAndGenerate')}
                </PrimaryButton>
              </div>
            </div>
          )}

          {status === 'downloading' && <DownloadProgress progress={progress} onCancel={cancel} />}

          {/* Success Message */}
          {status === 'completed' && outputPath && (
            <div className="text-center p-8 bg-emerald-50 border border-emerald-200 rounded-2xl shadow-lg shadow-emerald-500/5 animate-in zoom-in-95 duration-300">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                <CheckCircle className="w-10 h-10 text-emerald-500" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">{t('downloadComplete')}</h3>
              <p className="text-slate-600 text-sm mb-2 break-all font-mono bg-white/50 inline-block px-3 py-1 rounded-lg border border-emerald-100">
                {outputPath}
              </p>
              {thumbnailPath && (
                <p className="text-slate-500 text-xs mb-6 break-all">
                  {t('thumbnail')}: {thumbnailPath}
                </p>
              )}
              <div className="flex gap-4 justify-center flex-wrap mt-6">
                <button
                  onClick={() => window.electronAPI.showItemInFolder(outputPath)}
                  className="px-6 py-3 bg-white border border-slate-200 rounded-xl text-slate-700 font-semibold transition-all hover:bg-slate-50 hover:text-slate-900 shadow-sm"
                >
                  <span className="flex items-center gap-2">
                    <FolderOpen className="w-4 h-4" /> {t('openOutputDir')}
                  </span>
                </button>
                <button
                  onClick={reset}
                  className="px-6 py-3 bg-white border border-slate-200 rounded-xl text-slate-700 font-semibold transition-all hover:bg-slate-50 hover:text-slate-900 shadow-sm"
                >
                  {t('downloadNewVideo')}
                </button>
                {onDownloadComplete && (
                  <PrimaryButton
                    onClick={() => onDownloadComplete(outputPath)}
                    variant="primary"
                    icon={<Play className="w-4 h-4 fill-current" />}
                    className="rounded-xl shadow-md"
                  >
                    {t('continueGenerating')}
                  </PrimaryButton>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
