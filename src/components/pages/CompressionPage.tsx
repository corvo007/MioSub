import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { type SpeakerUIProfile } from '@/types/speaker';
import { type CompressionOptions, type CompressionProgress } from '@/types/compression';
import { FileVideo, Settings, Play, FolderOpen, FileText, AlertCircle, X } from 'lucide-react';
import { PageHeader, HeaderButton } from '@/components/layout/PageHeader';
import { SimpleConfirmationModal } from '@/components/modals/SimpleConfirmationModal';
import { generateAssContent } from '@/services/subtitle/generator';
import { type SubtitleItem } from '@/types/subtitle';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { HardwareAccelerationSelector } from '@/components/compression/HardwareAccelerationSelector';
import { ResolutionSelector } from '@/components/compression/ResolutionSelector';
import { EncoderSelector } from '@/components/compression/EncoderSelector';
import { useHardwareAcceleration } from '@/hooks/useHardwareAcceleration';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { NumberInput } from '@/components/ui/NumberInput';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { DirectorySelector } from '@/components/ui/DirectorySelector';
import { generateOutputPath, removeExtension } from '@/services/utils/path';
import { join } from 'pathe';
import { formatDuration } from '@/services/subtitle/time';
import { logger } from '@/services/utils/logger';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/cn';

interface CompressionPageProps {
  onGoBack?: () => void;
  workspaceSubtitles?: SubtitleItem[];
  workspaceVideoFile?: File | null;
  workspaceSpeakerProfiles?: SpeakerUIProfile[];
  downloadedVideoPath?: string | null;
}

type ResolutionPreset = 'original' | '1080p' | '720p' | '480p' | 'custom';

export const CompressionPage: React.FC<CompressionPageProps> = ({
  onGoBack,
  workspaceSubtitles,
  workspaceVideoFile,
  workspaceSpeakerProfiles,
  downloadedVideoPath,
}) => {
  // Store actions
  const setShowLogs = useAppStore((s) => s.setShowLogs);
  const setShowSettings = useAppStore((s) => s.setShowSettings);
  const targetLanguage = useAppStore((s) => s.settings.targetLanguage);

  const { t } = useTranslation('compression');
  const [file, setFile] = useState<File | null>(null);
  const [options, setOptions] = useState<CompressionOptions>({
    encoder: 'libx264',
    crf: 23,
    width: 0,
    height: 0,
  });
  const [resolutionPreset, setResolutionPreset] = useState<ResolutionPreset>('original');
  const [subtitleMode, setSubtitleMode] = useState<'none' | 'file' | 'workspace'>('none');
  const [subtitlePath, setSubtitlePath] = useState('');
  const [outputPath, setOutputPath] = useState('');
  const [progress, setProgress] = useState<CompressionProgress | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionStartTime, setCompressionStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState('00:00');
  const [showAutoLoadPrompt, setShowAutoLoadPrompt] = useState(false);
  const [showDownloadedVideoPrompt, setShowDownloadedVideoPrompt] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Update elapsed time every second during compression

  useEffect(() => {
    if (!compressionStartTime) {
      setElapsedTime('00:00');
      return;
    }
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - compressionStartTime) / 1000);
      setElapsedTime(formatDuration(elapsed));
    }, 1000);
    return () => clearInterval(interval);
  }, [compressionStartTime]);

  // Hardware acceleration state
  const [hwAccelEnabled, setHwAccelEnabled] = useState(true);
  const { hwAccelInfo } = useHardwareAcceleration();

  // Check for workspace video on mount or update
  useEffect(() => {
    if (workspaceVideoFile && !file) {
      setShowAutoLoadPrompt(true);
    }
  }, [workspaceVideoFile, file]);

  const handleAutoLoad = () => {
    if (workspaceVideoFile) {
      setFile(workspaceVideoFile);
      const path = (workspaceVideoFile as any).path || '';
      setOutputPath(generateOutputPath(path, workspaceVideoFile.name));

      if (workspaceSubtitles && workspaceSubtitles.length > 0) {
        setSubtitleMode('workspace');
      }
      setShowAutoLoadPrompt(false);
    }
  };

  // Check for downloaded video path on mount or update
  useEffect(() => {
    if (downloadedVideoPath && !file && !workspaceVideoFile) {
      setShowDownloadedVideoPrompt(true);
    }
  }, [downloadedVideoPath, file, workspaceVideoFile]);

  const handleLoadDownloadedVideo = async () => {
    if (downloadedVideoPath) {
      try {
        // Use IPC to read file buffer
        const buffer = await window.electronAPI.readLocalFile(downloadedVideoPath);
        const filename = downloadedVideoPath.split(/[\\/]/).pop() || 'video.mp4';
        const ext = filename.split('.').pop()?.toLowerCase();
        const type =
          ext === 'mp4' ? 'video/mp4' : ext === 'mkv' ? 'video/x-matroska' : 'video/webm';

        const videoFile = new File([buffer], filename, { type });
        // Attach path for FFmpeg usage
        Object.defineProperty(videoFile, 'path', {
          value: downloadedVideoPath,
          writable: false,
          enumerable: false,
          configurable: false,
        });

        setFile(videoFile);
        setOutputPath(generateOutputPath(downloadedVideoPath, filename));
        setShowDownloadedVideoPrompt(false);
      } catch (e: any) {
        logger.error('Failed to load downloaded video', e);
        setShowDownloadedVideoPrompt(false);
      }
    }
  };

  // Update resolution options based on preset
  useEffect(() => {
    switch (resolutionPreset) {
      case '1080p':
        setOptions((prev) => ({ ...prev, width: 1920, height: 1080 }));
        break;
      case '720p':
        setOptions((prev) => ({ ...prev, width: 1280, height: 720 }));
        break;
      case '480p':
        setOptions((prev) => ({ ...prev, width: 854, height: 480 }));
        break;
      case 'original':
        setOptions((prev) => ({ ...prev, width: 0, height: 0 }));
        break;
    }
  }, [resolutionPreset]);

  // 防抖文件选择处理函数 - 防止快速重复点击
  const handleFileSelect = useDebouncedCallback((f: File) => {
    setFile(f);
    const path = window.electronAPI?.getFilePath(f) || (f as any).path || '';
    setOutputPath(generateOutputPath(path, f.name));
    setShowAutoLoadPrompt(false); // Hide prompt if user manually selects a file
  });

  // 防抖输出目录选择处理函数 - 防止快速重复点击
  const handleSelectOutputDir = useDebouncedCallback(async () => {
    try {
      const result = await window.electronAPI.download.selectDir();
      if (result.success && result.path && file) {
        const name = removeExtension(file.name);
        setOutputPath(join(result.path, `${name}_compressed.mp4`));
      }
    } catch (err) {
      logger.error('Failed to select directory', err);
    }
  });

  // 防抖开始压制处理函数 - 防止快速重复点击
  const handleStartCompression = useDebouncedCallback(async () => {
    if (!file || !outputPath) return;

    // Get file path - try getFilePath API first, fallback to path property
    const inputPath = window.electronAPI?.getFilePath?.(file) || (file as any).path;
    if (!inputPath) {
      setErrorMessage(t('errors.noVideoPath'));
      return;
    }

    setIsCompressing(true);
    setCompressionStartTime(Date.now());
    try {
      let finalSubtitlePath = undefined;

      // Handle Subtitles
      if (subtitleMode === 'file') {
        if (subtitlePath) {
          finalSubtitlePath = subtitlePath;
        }
      } else if (
        subtitleMode === 'workspace' &&
        workspaceSubtitles &&
        workspaceSubtitles.length > 0
      ) {
        try {
          const assContent = generateAssContent(
            workspaceSubtitles,
            'Gemini Subtitle',
            true,
            false,
            true,
            workspaceSpeakerProfiles,
            targetLanguage
          );
          const res = await window.electronAPI.writeTempFile(assContent, 'ass');
          if (res.success && res.path) {
            finalSubtitlePath = res.path;
          } else {
            throw new Error(t('errors.tempSubtitleFailed') + ': ' + res.error);
          }
        } catch (err: any) {
          throw new Error(t('errors.subtitleGenFailed') + ': ' + err.message);
        }
      }

      // Determine Video Source
      const videoSource =
        workspaceVideoFile && file === workspaceVideoFile ? 'workspace' : 'external';

      // Determine Subtitle Source
      const subtitleSource =
        subtitleMode === 'none' ? 'none' : subtitleMode === 'workspace' ? 'workspace' : 'external';

      const cleanup = window.electronAPI.compression.onProgress((p) => setProgress(p));
      try {
        await window.electronAPI.compression.compress(inputPath, outputPath, {
          ...options,
          subtitlePath: finalSubtitlePath,
          hwAccel: hwAccelEnabled ? 'auto' : 'off',
          videoSource,
          subtitleSource,
        });
      } finally {
        cleanup();
      }
      setShowSuccessModal(true);
    } catch (e: any) {
      // Don't show error for user-initiated cancellation
      if (!e.message?.includes('CANCELLED')) {
        setErrorMessage(t('errors.compressFailed') + ': ' + e.message);
      }
    } finally {
      setIsCompressing(false);
      setCompressionStartTime(null);
      setProgress(null);
    }
  });

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
            </>
          }
        />

        <div className="flex-1 overflow-y-auto mt-8 pr-2 custom-scrollbar">
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 gap-6 md:gap-8 pb-4">
            {/* Left Column: Input & Settings */}
            <div className="space-y-6">
              {/* File Input */}
              <div className="space-y-4">
                <div
                  className={cn(
                    'relative group p-8 rounded-2xl border-2 border-dashed transition-all cursor-pointer text-center',
                    file
                      ? 'border-brand-purple/50 bg-brand-purple/5'
                      : 'border-slate-300 hover:border-brand-purple/50 hover:bg-white/50 bg-white/30'
                  )}
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'video/*';
                    input.onchange = (e) => {
                      const f = (e.target as HTMLInputElement).files?.[0];
                      if (f) handleFileSelect(f);
                    };
                    input.click();
                  }}
                >
                  <div className="flex flex-col items-center justify-center gap-4">
                    <div
                      className={cn(
                        'p-4 rounded-full transition-colors shadow-sm',
                        file
                          ? 'bg-brand-purple/20'
                          : 'bg-white shadow-md group-hover:scale-110 duration-200'
                      )}
                    >
                      <FolderOpen
                        className={cn('w-8 h-8', file ? 'text-brand-purple' : 'text-slate-400')}
                      />
                    </div>
                    {file ? (
                      <div className="space-y-1 overflow-hidden w-full">
                        <p className="text-lg font-bold text-slate-800 truncate" title={file.name}>
                          {file.name}
                        </p>
                        <p
                          className="text-xs text-slate-500 truncate bg-white/50 py-1 px-2 rounded inline-block max-w-full"
                          title={window.electronAPI?.getFilePath(file) || (file as any).path}
                        >
                          {window.electronAPI?.getFilePath(file) || (file as any).path}
                        </p>
                        <p className="text-sm text-slate-500 font-medium">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                        {workspaceVideoFile && file === workspaceVideoFile && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-purple/10 text-brand-purple border border-brand-purple/20 mt-2">
                            {t('fromWorkspace')}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-lg font-bold text-slate-700">{t('selectVideo')}</p>
                        <p className="text-sm text-slate-500">{t('supportedFormats')}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Auto-load Prompt */}
                {showAutoLoadPrompt && workspaceVideoFile && (
                  <div className="bg-white border border-brand-purple/20 rounded-xl p-4 flex items-center justify-between animate-fade-in shadow-lg shadow-brand-purple/5">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-brand-purple/10 rounded-full">
                        <AlertCircle className="w-5 h-5 text-brand-purple" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">
                          {t('workspaceFileDetected')}
                        </p>
                        <p className="text-xs text-slate-500">{t('autoLoadPrompt')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowAutoLoadPrompt(false)}
                        className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handleAutoLoad}
                        className="px-3 py-1.5 bg-brand-purple hover:bg-brand-purple/90 text-white text-xs font-semibold rounded-lg transition-colors shadow-md shadow-brand-purple/20"
                      >
                        {t('load')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Downloaded Video Prompt */}
                {showDownloadedVideoPrompt && downloadedVideoPath && (
                  <div className="bg-white border border-brand-orange/20 rounded-xl p-4 flex items-center justify-between animate-fade-in shadow-lg shadow-brand-orange/5">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-brand-orange/10 rounded-full">
                        <FileVideo className="w-5 h-5 text-brand-orange" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">
                          {t('downloadedVideoDetected')}
                        </p>
                        <p className="text-xs text-slate-500 truncate max-w-xs">
                          {downloadedVideoPath.split(/[\\/]/).pop()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowDownloadedVideoPrompt(false)}
                        className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handleLoadDownloadedVideo}
                        className="px-3 py-1.5 bg-brand-orange hover:bg-brand-orange/90 text-white text-xs font-semibold rounded-lg transition-colors shadow-md shadow-brand-orange/20"
                      >
                        {t('load')}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Settings Panel */}
              <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl border border-white/20 shadow-xl shadow-slate-200/40 space-y-6">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-4">
                  <Settings className="w-5 h-5 text-brand-purple" /> {t('parameters')}
                </h2>

                {/* Encoder */}
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <label className="w-32 text-sm font-semibold text-slate-600 shrink-0">
                    {t('encoder')}
                  </label>
                  <div className="flex-1">
                    <EncoderSelector
                      value={options.encoder}
                      onChange={(val) => setOptions({ ...options, encoder: val as any })}
                    />
                  </div>
                </div>

                {/* Hardware Acceleration */}
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <label className="w-32 text-sm font-semibold text-slate-600 shrink-0">
                    {t('hardwareAccel')}
                  </label>
                  <div className="flex-1">
                    <HardwareAccelerationSelector
                      hwAccelInfo={hwAccelInfo}
                      enabled={hwAccelEnabled}
                      onToggle={() => setHwAccelEnabled(!hwAccelEnabled)}
                      encoder={options.encoder}
                    />
                  </div>
                </div>

                {/* CRF */}
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <label className="w-32 text-sm font-semibold text-slate-600 shrink-0">
                    {t('quality')}
                  </label>
                  <div className="flex-1 space-y-2">
                    <NumberInput
                      value={options.crf}
                      onChange={(v) => setOptions({ ...options, crf: v ?? 23 })}
                      min={0}
                      max={51}
                      allowDecimals={true}
                      className="w-full bg-slate-50 border-slate-200 text-slate-900 focus:border-brand-purple focus:ring-brand-purple/20"
                    />
                    <div className="text-xs text-slate-500">{t('qualityHint')}</div>
                  </div>
                </div>

                {/* Resolution */}
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <label className="w-32 text-sm font-semibold text-slate-600 shrink-0">
                    {t('resolution')}
                  </label>
                  <div className="flex-1">
                    <ResolutionSelector
                      resolution={resolutionPreset}
                      width={options.width}
                      height={options.height}
                      onChange={(res, w, h) => {
                        setResolutionPreset(res as any);
                        setOptions((prev) => ({ ...prev, width: w, height: h }));
                      }}
                    />
                  </div>
                </div>

                {/* Subtitles */}
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <label className="w-32 text-sm font-semibold text-slate-600 shrink-0">
                    {t('subtitleEmbed')}
                  </label>
                  <div className="flex-1 space-y-3">
                    <CustomSelect
                      value={subtitleMode}
                      onChange={(val) => setSubtitleMode(val as any)}
                      options={[
                        {
                          value: 'none',
                          label: (
                            <div>
                              <div className="font-medium text-slate-900">{t('subtitleNone')}</div>
                              <div className="text-xs text-slate-500">{t('subtitleNoneDesc')}</div>
                            </div>
                          ),
                        },
                        {
                          value: 'file',
                          label: (
                            <div>
                              <div className="font-medium text-slate-900">{t('subtitleLocal')}</div>
                              <div className="text-xs text-slate-500">{t('subtitleLocalDesc')}</div>
                            </div>
                          ),
                        },
                        {
                          value: 'workspace',
                          disabled: !workspaceSubtitles || workspaceSubtitles.length === 0,
                          label: (
                            <div>
                              <div className="font-medium text-slate-900">
                                {t('subtitleWorkspace')}
                              </div>
                              <div className="text-xs text-slate-500">
                                {!workspaceSubtitles || workspaceSubtitles.length === 0
                                  ? t('subtitleWorkspaceEmpty')
                                  : t('subtitleWorkspaceCount', {
                                      count: workspaceSubtitles.length,
                                    })}
                              </div>
                            </div>
                          ),
                        },
                      ]}
                    />

                    {subtitleMode === 'file' && (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={subtitlePath}
                          readOnly
                          placeholder={t('selectSubtitleFile')}
                          className="flex-1 bg-slate-50 border border-slate-200 rounded-lg py-2.5 px-4 text-slate-700 text-sm focus:outline-none focus:border-brand-purple focus:ring-1 focus:ring-brand-purple/20 transition-all placeholder:text-slate-400"
                        />
                        <button
                          onClick={async () => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = '.ass,.srt,.ssa';
                            input.onchange = (e) => {
                              const f = (e.target as HTMLInputElement).files?.[0];
                              if (f) {
                                const path =
                                  window.electronAPI?.getFilePath?.(f) || (f as any).path;
                                if (path) setSubtitlePath(path);
                              }
                            };
                            input.click();
                          }}
                          className="bg-white hover:bg-slate-50 px-4 rounded-lg border border-slate-200 hover:border-brand-purple/30 text-slate-600 hover:text-brand-purple transition-colors shadow-sm"
                        >
                          <FolderOpen className="w-5 h-5" />
                        </button>
                      </div>
                    )}
                    {subtitleMode === 'workspace' && (
                      <div className="flex items-center gap-2 p-3 bg-brand-purple/5 border border-brand-purple/10 rounded-lg">
                        <FileText className="w-4 h-4 text-brand-purple" />
                        <span className="text-sm text-brand-purple/80">{t('autoGenerateAss')}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Output & Progress */}
            <div className="space-y-6">
              {/* Output Path */}
              <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl border border-white/20 shadow-xl shadow-slate-200/40">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-4 mb-4">
                  <FolderOpen className="w-5 h-5 text-brand-purple" /> {t('outputSettings')}
                </h2>
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <label className="w-20 text-sm font-semibold text-slate-600 shrink-0">
                    {t('outputDir')}
                  </label>
                  <div className="flex-1 min-w-0">
                    <DirectorySelector
                      value={outputPath}
                      placeholder={t('notSelected')}
                      onSelect={handleSelectOutputDir}
                      variant="default" // Changed from accent to default for light mode compatibility if needed, or keep accent if it handles light mode
                    />
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={handleStartCompression}
                disabled={!file || isCompressing}
                className={cn(
                  'w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-lg transform active:scale-[0.98]',
                  !file || isCompressing
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                    : 'bg-linear-to-r from-brand-purple to-brand-orange hover:from-brand-purple/90 hover:to-brand-orange/90 text-white shadow-brand-purple/25 hover:shadow-brand-purple/40 ring-2 ring-transparent hover:ring-brand-purple/20'
                )}
              >
                {isCompressing ? (
                  <span className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t('compressing')}
                  </span>
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-current" /> {t('startCompress')}
                  </>
                )}
              </button>

              {/* Progress Card */}
              {progress && (
                <div className="bg-white/90 backdrop-blur-xl p-6 rounded-2xl border border-white/20 shadow-xl shadow-brand-purple/5 space-y-4 animate-in slide-in-from-bottom-5 fade-in duration-300">
                  <div className="flex justify-between items-end">
                    <span className="text-4xl font-bold text-slate-800 tracking-tight">
                      {progress.percent.toFixed(1)}
                      <span className="text-lg text-slate-500 font-normal ml-1">%</span>
                    </span>
                    <div className="text-right">
                      <div className="text-brand-purple font-semibold">
                        {progress.currentFps}{' '}
                        <span className="text-xs text-slate-500 font-normal">FPS</span>
                      </div>
                      <div className="text-xs text-slate-500">{progress.currentKbps} kbps</div>
                    </div>
                  </div>

                  <ProgressBar percent={progress.percent} size="md" showShimmer />

                  <div className="flex justify-between items-center text-xs text-slate-500 pt-3 border-t border-slate-100">
                    <span>
                      {t('elapsed')}: {elapsedTime} | {t('progress')}: {progress.timemark}
                    </span>
                    <span>
                      {t('size')}: {(progress.targetSize / 1024).toFixed(2)} MB
                    </span>
                  </div>

                  {/* Cancel Button */}
                  <button
                    onClick={async () => {
                      try {
                        await window.electronAPI.compression.cancel();
                      } catch (e) {
                        logger.error('Failed to cancel compression', e);
                      }
                    }}
                    className="w-full py-2.5 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 hover:text-red-700 text-sm font-semibold transition-colors flex items-center justify-center gap-2 mt-2"
                  >
                    <X className="w-4 h-4" /> {t('cancelCompress')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* Success Modal */}
      <SimpleConfirmationModal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        onConfirm={() => {
          if (outputPath) {
            void window.electronAPI.showItemInFolder(outputPath);
          }
        }}
        title={t('compressComplete')}
        message={t('compressCompleteMsg')}
        confirmText={t('openOutputDir')}
        cancelText={t('close')}
        type="info"
      />
      {/* Error Modal */}
      <SimpleConfirmationModal
        isOpen={!!errorMessage}
        onClose={() => setErrorMessage(null)}
        onConfirm={() => setErrorMessage(null)}
        title={t('compressFailed')}
        message={errorMessage || ''}
        confirmText={t('confirm')}
        type="warning"
        hideCancelButton
      />
    </div>
  );
};
