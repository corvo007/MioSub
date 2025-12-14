/**
 * End-to-End Wizard Component
 * 全屏向导组件，引导用户完成端到端字幕生成流程
 */

import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Link2,
  Settings,
  Play,
  CheckCircle,
  XCircle,
  Loader2,
  FolderOpen,
  Sparkles,
  Film,
  FileText,
  Download,
  Wand2,
  AlertCircle,
  RefreshCw,
  Book,
  Cpu,
  Zap,
} from 'lucide-react';
import type { HardwareAccelInfo } from '@/services/compression/types';
import { useEndToEnd } from '@/hooks/useEndToEnd';
import { EndToEndProgress } from './EndToEndProgress';
import { formatDuration } from '@/services/subtitle/time';
import type { AppSettings } from '@/types/settings';
import { CustomSelect } from '../settings/CustomSelect';

interface EndToEndWizardProps {
  settings: AppSettings;
  onComplete?: () => void;
  onCancel: () => void;
  onShowLogs?: () => void;
  onShowGlossary?: () => void;
  onShowSettings?: () => void;
}

/** 步骤指示器 */
function StepIndicator({
  currentStep,
  steps,
}: {
  currentStep: number;
  steps: { label: string; icon: React.ReactNode }[];
}) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {steps.map((step, index) => (
        <React.Fragment key={index}>
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
              index < currentStep
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : index === currentStep
                  ? 'bg-violet-500/20 text-violet-300 border border-violet-500/50'
                  : 'bg-white/5 text-white/40 border border-white/10'
            }`}
          >
            <span className="w-5 h-5">{step.icon}</span>
            <span className="text-sm font-medium hidden sm:inline">{step.label}</span>
          </div>
          {index < steps.length - 1 && (
            <div
              className={`w-8 h-0.5 ${index < currentStep ? 'bg-emerald-500/50' : 'bg-white/10'}`}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

/** URL 验证辅助函数 */
function isValidVideoUrl(url: string): { valid: boolean; platform?: string; error?: string } {
  if (!url || !url.trim()) {
    return { valid: false, error: '请输入视频链接' };
  }

  const trimmedUrl = url.trim();

  // Check basic URL format
  try {
    new URL(trimmedUrl);
  } catch {
    return { valid: false, error: '链接格式无效' };
  }

  // YouTube patterns
  const youtubePatterns = [
    /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
    /^https?:\/\/youtu\.be\/[\w-]+/,
    /^https?:\/\/(www\.)?youtube\.com\/shorts\/[\w-]+/,
  ];

  // Bilibili patterns
  const bilibiliPatterns = [
    /^https?:\/\/(www\.)?bilibili\.com\/video\/[A-Za-z0-9]+/,
    /^https?:\/\/b23\.tv\/[A-Za-z0-9]+/,
  ];

  if (youtubePatterns.some((p) => p.test(trimmedUrl))) {
    return { valid: true, platform: 'YouTube' };
  }

  if (bilibiliPatterns.some((p) => p.test(trimmedUrl))) {
    return { valid: true, platform: 'Bilibili' };
  }

  // Allow other URLs but warn user
  return { valid: true, platform: '其他', error: '可能不支持此平台，将尝试解析' };
}

/** 步骤 1: 输入链接 */
function StepInput({
  url,
  onUrlChange,
  onParse,
  isParsing,
  parseError,
  videoInfo,
}: {
  url: string;
  onUrlChange: (url: string) => void;
  onParse: () => void;
  isParsing: boolean;
  parseError?: string;
  videoInfo?: any;
}) {
  const [inputUrl, setInputUrl] = useState(url);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    platform?: string;
    error?: string;
  } | null>(null);

  // Validate URL on change
  useEffect(() => {
    if (inputUrl.trim()) {
      setValidationResult(isValidVideoUrl(inputUrl));
    } else {
      setValidationResult(null);
    }
  }, [inputUrl]);

  const handleParse = () => {
    if (!inputUrl.trim()) return;
    onUrlChange(inputUrl.trim());
    onParse();
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-500/30 mb-4">
          <Link2 className="w-8 h-8 text-violet-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">输入视频链接</h2>
        <p className="text-white/60">支持 YouTube 和 Bilibili 视频</p>
      </div>

      <div className="space-y-4">
        <div className="relative">
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            onKeyDown={(e) =>
              e.key === 'Enter' && !isParsing && validationResult?.valid && handleParse()
            }
            placeholder="粘贴视频链接，如 https://www.youtube.com/watch?v=..."
            className={`w-full px-4 py-4 bg-white/5 border rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 transition-all ${
              validationResult?.valid === false
                ? 'border-red-500/50 focus:border-red-500/50 focus:ring-red-500/20'
                : validationResult?.valid
                  ? 'border-emerald-500/30 focus:border-emerald-500/50 focus:ring-emerald-500/20'
                  : 'border-white/10 focus:border-violet-500/50 focus:ring-violet-500/20'
            }`}
            disabled={isParsing}
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {validationResult?.platform && validationResult.valid && (
              <span className="text-xs px-2 py-1 bg-violet-500/20 text-violet-300 rounded">
                {validationResult.platform}
              </span>
            )}
            {isParsing && <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />}
          </div>
        </div>

        {/* Validation warning (not error) */}
        {validationResult?.error && validationResult.valid && (
          <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-200 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{validationResult.error}</span>
          </div>
        )}

        {/* Validation error */}
        {validationResult?.error && !validationResult.valid && (
          <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-200 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{validationResult.error}</span>
          </div>
        )}

        {/* Parse error from server */}
        {parseError && (
          <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-200">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{parseError}</span>
          </div>
        )}

        {videoInfo && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
            <div className="flex items-start gap-4">
              {videoInfo.thumbnail && (
                <img
                  src={videoInfo.thumbnail}
                  alt="Thumbnail"
                  className="w-24 h-16 object-cover rounded-lg"
                  onError={(e) => {
                    // Hide broken thumbnail
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-white truncate">{videoInfo.title || '未知标题'}</h4>
                <p className="text-sm text-white/60">{videoInfo.uploader || '未知作者'}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded">
                    {videoInfo.platform || '视频'}
                  </span>
                  {videoInfo.duration != null && (
                    <span className="text-xs text-white/50">
                      {formatDuration(videoInfo.duration)}
                    </span>
                  )}
                </div>
              </div>
              <CheckCircle className="w-6 h-6 text-emerald-400 shrink-0" />
            </div>
          </div>
        )}

        <button
          onClick={handleParse}
          disabled={isParsing || !inputUrl.trim() || validationResult?.valid === false}
          className="w-full py-4 bg-gradient-to-r from-violet-500 to-indigo-500 rounded-xl text-white font-medium transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-violet-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
        >
          {isParsing ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              正在解析...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Sparkles className="w-5 h-5" />
              解析视频
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

/** 内容类型选择器 - 复刻自 GenreSettingsDialog */
const GENRE_PRESETS = ['general', 'anime', 'movie', 'news', 'tech'];
const GENRE_LABELS: Record<string, string> = {
  general: '通用',
  anime: '动漫',
  movie: '电影/剧集',
  news: '新闻',
  tech: '科技',
};

function GenreSelector({
  currentGenre,
  onGenreChange,
}: {
  currentGenre: string;
  onGenreChange: (genre: string) => void;
}) {
  const isCustom = !GENRE_PRESETS.includes(currentGenre);
  const [showCustomInput, setShowCustomInput] = useState(isCustom);
  const [customValue, setCustomValue] = useState(isCustom ? currentGenre : '');

  const handlePresetClick = (genre: string) => {
    setShowCustomInput(false);
    setCustomValue('');
    onGenreChange(genre);
  };

  const handleCustomClick = () => {
    setShowCustomInput(true);
  };

  const handleCustomChange = (value: string) => {
    setCustomValue(value);
    if (value.trim()) {
      onGenreChange(value.trim());
    }
  };

  return (
    <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
      <label className="block text-sm font-medium text-white/80 mb-3">
        <Film className="w-4 h-4 inline mr-2" />
        内容类型
      </label>
      <div className="grid grid-cols-3 gap-2">
        {GENRE_PRESETS.map((genre) => (
          <button
            key={genre}
            onClick={() => handlePresetClick(genre)}
            className={`px-3 py-2 rounded-lg text-sm border transition-all ${
              currentGenre === genre && !showCustomInput
                ? 'bg-violet-500/20 border-violet-500/50 text-violet-300'
                : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white/80'
            }`}
          >
            {GENRE_LABELS[genre] || genre}
          </button>
        ))}
        <button
          onClick={handleCustomClick}
          className={`px-3 py-2 rounded-lg text-sm border transition-all ${
            showCustomInput
              ? 'bg-violet-500/20 border-violet-500/50 text-violet-300'
              : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white/80'
          }`}
        >
          自定义...
        </button>
      </div>
      {showCustomInput && (
        <div className="mt-3">
          <input
            type="text"
            value={customValue}
            onChange={(e) => handleCustomChange(e.target.value)}
            placeholder="例如：游戏解说、医学讲座、科技评测..."
            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-violet-500/50 placeholder-white/40"
            autoFocus
          />
        </div>
      )}
    </div>
  );
}

/** 步骤 2: 配置选项 */
function StepConfig({
  config,
  onConfigChange,
  videoInfo,
}: {
  config: any;
  onConfigChange: (updates: any) => void;
  videoInfo?: any;
}) {
  const [hwAccelInfo, setHwAccelInfo] = useState<HardwareAccelInfo | null>(null);

  useEffect(() => {
    (async () => {
      if (window.electronAPI?.compression?.getHwAccelInfo) {
        try {
          const info = await window.electronAPI.compression.getHwAccelInfo();
          setHwAccelInfo(info);
        } catch (err) {
          console.error('Failed to get hw info', err);
        }
      }
    })();
  }, []);

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
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 mb-4">
          <Settings className="w-8 h-8 text-emerald-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">配置参数</h2>
        <p className="text-white/60">设置下载、字幕和压制选项</p>
      </div>

      {/* Video Info Card */}
      {videoInfo && (
        <div className="p-4 bg-white/5 border border-white/10 rounded-xl mb-6">
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
        </div>
      )}

      <div className="space-y-6">
        {/* ================================ */}
        {/* Section 1: 下载配置 */}
        {/* ================================ */}
        <ConfigSection title="下载配置" icon={<Download className="w-4 h-4" />}>
          {/* Output Directory */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-white/70 mb-2">输出目录</label>
            <div className="flex items-center gap-3">
              <span className="flex-1 px-3 py-2 bg-white/5 rounded-lg text-white/70 text-sm truncate">
                {config.outputDir || '未选择'}
              </span>
              <button
                onClick={handleSelectDir}
                className="px-4 py-2 bg-violet-500/20 border border-violet-500/30 rounded-lg text-violet-300 text-sm transition-colors hover:bg-violet-500/30"
              >
                选择
              </button>
            </div>
          </div>

          {/* Video Quality */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-white/70 mb-2">下载清晰度</label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { value: 'best', label: '最佳' },
                { value: '1080p', label: '1080p' },
                { value: '720p', label: '720p' },
                { value: '480p', label: '480p' },
              ].map((quality) => (
                <button
                  key={quality.value}
                  onClick={() => onConfigChange({ downloadFormat: quality.value })}
                  className={`px-3 py-2 rounded-lg text-sm border transition-all ${
                    (config.downloadFormat || 'best') === quality.value
                      ? 'bg-violet-500/20 border-violet-500/50 text-violet-300'
                      : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {quality.label}
                </button>
              ))}
            </div>
          </div>

          {/* Download Thumbnail */}
          <ToggleOptionInline
            label="下载封面"
            checked={config.downloadThumbnail !== false}
            onChange={(v) => onConfigChange({ downloadThumbnail: v })}
          />
        </ConfigSection>

        {/* ================================ */}
        {/* Section 2: 字幕生成配置 */}
        {/* ================================ */}
        <ConfigSection title="字幕生成配置" icon={<FileText className="w-4 h-4" />}>
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
              label="启用术语提取"
              description="自动识别并提取专有名词"
              checked={config.enableGlossary !== false}
              onChange={(v) => onConfigChange({ enableGlossary: v })}
            />
            <ToggleOptionInline
              label="说话人识别"
              description="识别音频中的不同说话人"
              checked={config.enableSpeakerDetection !== false}
              onChange={(v) => onConfigChange({ enableSpeakerDetection: v })}
            />
            {/* Speaker Options */}
            {config.enableSpeakerDetection !== false && (
              <div className="ml-8 mt-1 space-y-1 border-l-2 border-white/10 pl-3">
                <ToggleOptionInline
                  label="显示说话人名称"
                  description="在字幕文本中包含说话人名字"
                  checked={!!config.includeSpeaker}
                  onChange={(v) => onConfigChange({ includeSpeaker: v })}
                />
                <ToggleOptionInline
                  label="使用说话人颜色"
                  description="为不同说话人使用不同颜色 (仅ASS)"
                  checked={!!config.useSpeakerColors}
                  onChange={(v) => onConfigChange({ useSpeakerColors: v })}
                />
              </div>
            )}
          </div>
        </ConfigSection>

        {/* ================================ */}
        {/* Section 3: 压制配置 */}
        {/* ================================ */}
        <ConfigSection title="视频压制配置" icon={<Film className="w-4 h-4" />}>
          <ToggleOptionInline
            label="启用视频压制"
            description="将字幕内嵌到视频中生成成品"
            checked={config.enableCompression !== false}
            onChange={(v) => onConfigChange({ enableCompression: v })}
          />

          {config.enableCompression !== false && (
            <div className="mt-6 space-y-6 pl-2">
              {/* Hardware Acceleration (Reused from CompressionPage) */}
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <label className="w-24 text-xs font-medium text-white/70 shrink-0">硬件加速</label>
                <div className="flex-1 space-y-2">
                  <button
                    onClick={() =>
                      hwAccelInfo?.available &&
                      onConfigChange({ useHardwareAccel: !(config.useHardwareAccel !== false) })
                    }
                    disabled={!hwAccelInfo || !hwAccelInfo.available}
                    className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${
                      !hwAccelInfo
                        ? 'bg-slate-800/50 border-slate-700/50 cursor-wait opacity-70'
                        : !hwAccelInfo.available
                          ? 'bg-slate-800/50 border-slate-700/50 cursor-not-allowed opacity-60'
                          : config.useHardwareAccel !== false
                            ? 'bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20'
                            : 'bg-slate-800 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {!hwAccelInfo ? (
                        <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                      ) : !hwAccelInfo.available ? (
                        <Cpu className="w-5 h-5 text-slate-500" />
                      ) : config.useHardwareAccel !== false ? (
                        <Zap className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <Cpu className="w-5 h-5 text-slate-400" />
                      )}

                      <div className="text-left">
                        <div
                          className={`font-medium ${
                            !hwAccelInfo
                              ? 'text-slate-400'
                              : !hwAccelInfo.available
                                ? 'text-slate-500'
                                : config.useHardwareAccel !== false
                                  ? 'text-emerald-300'
                                  : 'text-slate-300'
                          }`}
                        >
                          {!hwAccelInfo
                            ? '正在检测...'
                            : !hwAccelInfo.available
                              ? '硬件加速不可用'
                              : config.useHardwareAccel !== false
                                ? 'GPU 加速已开启'
                                : 'CPU 模式'}
                        </div>
                        <div className="text-xs text-slate-500">
                          {!hwAccelInfo
                            ? '正在检测硬件加速支持情况'
                            : !hwAccelInfo.available
                              ? '未检测到可以使用硬件加速的 GPU'
                              : config.useHardwareAccel !== false
                                ? `将使用 ${
                                    (config.compressionEncoder || 'libx264') === 'libx264'
                                      ? hwAccelInfo.preferredH264
                                      : hwAccelInfo.preferredH265
                                  }`
                                : '强制使用 CPU 编码'}
                        </div>
                      </div>
                    </div>

                    <div
                      className={`w-10 h-5 rounded-full relative transition-colors ${
                        !hwAccelInfo || !hwAccelInfo.available
                          ? 'bg-slate-700'
                          : config.useHardwareAccel !== false
                            ? 'bg-emerald-500'
                            : 'bg-slate-600'
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-md transition-all ${
                          config.useHardwareAccel !== false && hwAccelInfo?.available
                            ? 'left-5'
                            : 'left-0.5'
                        }`}
                      />
                    </div>
                  </button>

                  {hwAccelInfo?.available && config.useHardwareAccel !== false && (
                    <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                      <span>可用编码器:</span>
                      {hwAccelInfo.encoders.h264_nvenc && (
                        <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">
                          NVENC
                        </span>
                      )}
                      {hwAccelInfo.encoders.h264_qsv && (
                        <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                          QSV
                        </span>
                      )}
                      {hwAccelInfo.encoders.h264_amf && (
                        <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded">
                          AMF
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Encoder */}
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <label className="w-24 text-xs font-medium text-white/70 shrink-0">编码器</label>
                <div className="flex-1">
                  <CustomSelect
                    value={config.compressionEncoder || 'libx264'}
                    onChange={(v) => onConfigChange({ compressionEncoder: v as any })}
                    options={[
                      {
                        value: 'libx264',
                        label: (
                          <div>
                            <div className="font-medium text-slate-200">H.264 (AVC)</div>
                            <div className="text-xs text-slate-500">
                              兼容性最好，适合大多数播放器
                            </div>
                          </div>
                        ),
                      },
                      {
                        value: 'libx265',
                        label: (
                          <div>
                            <div className="font-medium text-slate-200">H.265 (HEVC)</div>
                            <div className="text-xs text-slate-500">高压缩率，同画质体积更小</div>
                          </div>
                        ),
                      },
                    ]}
                  />
                </div>
              </div>

              {/* Resolution Select */}
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <label className="w-24 text-xs font-medium text-white/70 shrink-0">分辨率</label>
                <div className="flex-1">
                  <CustomSelect
                    value={config.compressionResolution || 'original'}
                    onChange={(v) => onConfigChange({ compressionResolution: v as any })}
                    options={[
                      { value: 'original', label: '原画 (保持一致)' },
                      { value: '1080p', label: '1080p (全高清)' },
                      { value: '720p', label: '720p (高清)' },
                      { value: '480p', label: '480p (标清)' },
                    ]}
                  />
                </div>
              </div>

              {/* CRF Input (Reused from CompressionPage) */}
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <label className="w-24 text-xs font-medium text-white/70 shrink-0">
                  质量 (CRF)
                </label>
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={config.compressionCrf ?? 23}
                    onChange={(e) => {
                      const input = e.target.value;
                      if (input === '' || /^\d*\.?\d*$/.test(input)) {
                        const val = parseFloat(input);
                        if (!isNaN(val) && val >= 0 && val <= 51) {
                          onConfigChange({ compressionCrf: val });
                        }
                      }
                    }}
                    onBlur={(e) => {
                      const val = parseFloat(e.target.value);
                      if (isNaN(val) || val < 0) {
                        onConfigChange({ compressionCrf: 0 });
                      } else if (val > 51) {
                        onConfigChange({ compressionCrf: 51 });
                      }
                    }}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-sm"
                  />
                  <div className="text-xs text-slate-500">
                    范围 0-51，数值越小画质越高。推荐：H.264 (23), H.265 (28)
                  </div>
                </div>
              </div>
            </div>
          )}
        </ConfigSection>
      </div>
    </div>
  );
}

/** 切换选项组件 */
function ToggleOption({
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
        <div
          className={`w-10 h-6 rounded-full transition-colors relative ${
            checked ? 'bg-violet-500' : 'bg-white/20'
          }`}
        >
          <div
            className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
              checked ? 'translate-x-5' : 'translate-x-1'
            }`}
          />
        </div>
      </div>
    </div>
  );
}

/** 配置区块组件 */
function ConfigSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/10">
        <span className="text-violet-400">{icon}</span>
        <h3 className="font-medium text-white">{title}</h3>
      </div>
      {children}
    </div>
  );
}

/** 行内切换选项（更紧凑） */
function ToggleOptionInline({
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
      <div
        className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ${
          checked ? 'bg-violet-500' : 'bg-white/20'
        }`}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </div>
    </div>
  );
}

/** 行内内容类型选择器 */
function GenreSelectorInline({
  currentGenre,
  onGenreChange,
}: {
  currentGenre: string;
  onGenreChange: (genre: string) => void;
}) {
  const isCustom = !GENRE_PRESETS.includes(currentGenre);
  const [showCustomInput, setShowCustomInput] = useState(isCustom);
  const [customValue, setCustomValue] = useState(isCustom ? currentGenre : '');

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {GENRE_PRESETS.map((genre) => (
          <button
            key={genre}
            onClick={() => {
              setShowCustomInput(false);
              onGenreChange(genre);
            }}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
              currentGenre === genre && !showCustomInput
                ? 'bg-violet-500/20 border-violet-500/50 text-violet-300'
                : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
            }`}
          >
            {GENRE_LABELS[genre] || genre}
          </button>
        ))}
        <button
          onClick={() => setShowCustomInput(true)}
          className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
            showCustomInput
              ? 'bg-violet-500/20 border-violet-500/50 text-violet-300'
              : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
          }`}
        >
          自定义...
        </button>
      </div>
      {showCustomInput && (
        <input
          type="text"
          value={customValue}
          onChange={(e) => {
            setCustomValue(e.target.value);
            if (e.target.value.trim()) onGenreChange(e.target.value.trim());
          }}
          placeholder="例如：游戏解说、医学讲座..."
          className="mt-2 w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-violet-500/50 placeholder-white/40"
          autoFocus
        />
      )}
    </>
  );
}

/** 步骤 4: 结果展示 */
function StepResult({
  result,
  onReset,
  onClose,
}: {
  result?: any;
  onReset: () => void;
  onClose: () => void;
}) {
  const success = result?.success;
  const outputs = result?.outputs || {};

  const handleOpenFolder = (path: string) => {
    if (window.electronAPI?.showItemInFolder) {
      window.electronAPI.showItemInFolder(path);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div
          className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl border mb-4 ${
            success
              ? 'bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border-emerald-500/30'
              : 'bg-gradient-to-br from-red-500/20 to-orange-500/20 border-red-500/30'
          }`}
        >
          {success ? (
            <CheckCircle className="w-8 h-8 text-emerald-400" />
          ) : (
            <XCircle className="w-8 h-8 text-red-400" />
          )}
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">{success ? '处理完成' : '处理失败'}</h2>
        <p className="text-white/60">
          {success
            ? `耗时 ${Math.round((result?.duration || 0) / 1000 / 60)} 分钟`
            : result?.error || '发生未知错误'}
        </p>
      </div>

      {/* Outputs */}
      {success && (
        <div className="space-y-3 mb-8">
          {outputs.videoPath && (
            <OutputItem
              icon={<Film className="w-5 h-5" />}
              label="原始视频"
              path={outputs.videoPath}
              onOpen={() => handleOpenFolder(outputs.videoPath)}
            />
          )}
          {outputs.subtitlePath && (
            <OutputItem
              icon={<FileText className="w-5 h-5" />}
              label="字幕文件"
              path={outputs.subtitlePath}
              onOpen={() => handleOpenFolder(outputs.subtitlePath)}
            />
          )}
          {outputs.outputVideoPath && (
            <OutputItem
              icon={<Wand2 className="w-5 h-5" />}
              label="压制视频"
              path={outputs.outputVideoPath}
              onOpen={() => handleOpenFolder(outputs.outputVideoPath)}
              highlight
            />
          )}
        </div>
      )}

      {/* Error Details */}
      {!success && result?.errorDetails && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl mb-8">
          <div className="text-red-200 text-sm">
            <p className="font-medium mb-1">错误阶段: {result.errorDetails.stage}</p>
            <p className="text-red-300/70">{result.errorDetails.message}</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-4 justify-center">
        <button
          onClick={onReset}
          className="px-6 py-3 bg-white/10 border border-white/20 rounded-xl text-white font-medium transition-colors hover:bg-white/15"
        >
          <span className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            处理新视频
          </span>
        </button>
        <button
          onClick={onClose}
          className="px-6 py-3 bg-gradient-to-r from-violet-500 to-indigo-500 rounded-xl text-white font-medium transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-violet-500/30"
        >
          完成
        </button>
      </div>
    </div>
  );
}

/** 输出项组件 */
function OutputItem({
  icon,
  label,
  path,
  onOpen,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  path: string;
  onOpen: () => void;
  highlight?: boolean;
}) {
  const filename = path.split(/[/\\]/).pop() || path;

  return (
    <div
      className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-colors ${
        highlight
          ? 'bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/15'
          : 'bg-white/5 border-white/10 hover:bg-white/8'
      }`}
      onClick={onOpen}
    >
      <div className={highlight ? 'text-emerald-400' : 'text-white/60'}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className={`font-medium ${highlight ? 'text-emerald-300' : 'text-white'}`}>
          {label}
        </div>
        <div className="text-sm text-white/50 truncate">{filename}</div>
      </div>
      <FolderOpen className="w-5 h-5 text-white/40" />
    </div>
  );
}

/** 主向导组件*/
export function EndToEndWizard({
  settings,
  onComplete,
  onCancel,
  onShowLogs,
  onShowGlossary,
  onShowSettings,
}: EndToEndWizardProps) {
  const {
    state,
    setStep,
    goNext,
    goBack,
    updateConfig,
    resetConfig,
    resetToConfig,
    retryPipeline,
    parseUrl,
    videoInfo,
    startPipeline,
    abortPipeline,
    isElectron,
  } = useEndToEnd();

  const steps = [
    { label: '输入链接', icon: <Link2 className="w-4 h-4" /> },
    { label: '配置参数', icon: <Settings className="w-4 h-4" /> },
    { label: '执行处理', icon: <Play className="w-4 h-4" /> },
    { label: '完成', icon: <CheckCircle className="w-4 h-4" /> },
  ];

  const currentStepIndex = ['input', 'config', 'progress', 'result'].indexOf(state.currentStep);

  // Check if can proceed to next step
  const canProceed = () => {
    if (state.currentStep === 'input') {
      return !!videoInfo;
    }
    if (state.currentStep === 'config') {
      return !!state.config.outputDir;
    }
    return false;
  };

  const handleNext = async () => {
    if (state.currentStep === 'config') {
      // Start pipeline
      await startPipeline();
    } else {
      goNext();
    }
  };

  const handleParseUrl = async () => {
    if (state.config.url) {
      await parseUrl(state.config.url);
    }
  };

  if (!isElectron) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-8">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-amber-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">功能不可用</h2>
          <p className="text-white/60 mb-6">此功能仅在桌面版可用</p>
          <button
            onClick={onCancel}
            className="px-6 py-3 bg-white/10 border border-white/20 rounded-xl text-white"
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <header
        className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0 window-drag-region"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        <div
          className="flex items-center space-x-3 sm:space-x-4 min-w-0"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          <button
            onClick={onCancel}
            className="p-1.5 sm:p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2 flex-wrap">
              <span className="truncate">全自动模式</span>
              <span className="text-[10px] sm:text-xs font-normal text-slate-500 bg-slate-900 border border-slate-800 px-1.5 sm:px-2 py-0.5 rounded whitespace-nowrap">
                端到端模式
              </span>
            </h1>
            <p className="text-xs text-slate-400 truncate max-w-[200px] sm:max-w-[300px]">
              输入链接，自动生成字幕视频
            </p>
          </div>
        </div>
        {/* Header Actions */}
        <div
          className="flex items-center space-x-1.5 sm:space-x-2"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          {onShowLogs && (
            <button
              onClick={onShowLogs}
              className="flex items-center space-x-1.5 sm:space-x-2 px-2 sm:px-4 py-1.5 sm:py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors text-xs sm:text-sm font-medium group"
              title="查看日志"
            >
              <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 group-hover:text-blue-400 transition-colors" />
              <span className="hidden sm:inline text-slate-300 group-hover:text-white">日志</span>
            </button>
          )}
          {onShowGlossary && (
            <button
              onClick={onShowGlossary}
              className="flex items-center space-x-1.5 sm:space-x-2 px-2 sm:px-4 py-1.5 sm:py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors text-xs sm:text-sm font-medium group"
              title="术语表管理"
            >
              <Book className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 group-hover:text-indigo-400 transition-colors" />
              <span className="hidden sm:inline text-slate-300 group-hover:text-white">术语表</span>
            </button>
          )}
          {onShowSettings && (
            <button
              onClick={onShowSettings}
              className="flex items-center space-x-1.5 sm:space-x-2 px-2 sm:px-4 py-1.5 sm:py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors text-xs sm:text-sm font-medium group"
            >
              <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 group-hover:text-emerald-400 transition-colors" />
              <span className="hidden sm:inline text-slate-300 group-hover:text-white">设置</span>
            </button>
          )}
        </div>
      </header>

      {/* Step Indicator */}
      <div className="px-6 pt-8">
        <StepIndicator currentStep={currentStepIndex} steps={steps} />
      </div>

      {/* Content */}
      <div className="flex-1 px-6 py-8 overflow-y-auto">
        {state.currentStep === 'input' && (
          <StepInput
            url={state.config.url || ''}
            onUrlChange={(url) => updateConfig({ url })}
            onParse={handleParseUrl}
            isParsing={state.isParsing}
            parseError={state.parseError}
            videoInfo={videoInfo}
          />
        )}
        {state.currentStep === 'config' && (
          <StepConfig config={state.config} onConfigChange={updateConfig} videoInfo={videoInfo} />
        )}
        {state.currentStep === 'progress' && (
          <EndToEndProgress
            progress={state.progress}
            onAbort={abortPipeline}
            onRetry={retryPipeline}
          />
        )}
        {state.currentStep === 'result' && (
          <StepResult
            result={state.result}
            onReset={resetConfig}
            onClose={onComplete || onCancel}
          />
        )}
      </div>

      {/* Footer Navigation */}
      {state.currentStep !== 'progress' && state.currentStep !== 'result' && (
        <footer className="px-6 py-4 border-t border-white/10 shrink-0">
          <div className="max-w-3xl mx-auto flex justify-between">
            <button
              onClick={currentStepIndex > 0 ? goBack : onCancel}
              className="px-6 py-3 bg-white/10 border border-white/20 rounded-xl text-white font-medium transition-colors hover:bg-white/15"
            >
              <span className="flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" />
                {currentStepIndex > 0 ? '上一步' : '取消'}
              </span>
            </button>
            <button
              onClick={handleNext}
              disabled={!canProceed()}
              className="px-6 py-3 bg-gradient-to-r from-violet-500 to-indigo-500 rounded-xl text-white font-medium transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-violet-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              <span className="flex items-center gap-2">
                {state.currentStep === 'config' ? (
                  <>
                    <Play className="w-4 h-4" />
                    开始处理
                  </>
                ) : (
                  <>
                    下一步
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </span>
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
