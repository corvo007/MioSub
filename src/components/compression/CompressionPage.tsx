import React, { useState, useEffect } from 'react';
import {
  CompressionOptions,
  CompressionProgress,
  HardwareAccelInfo,
} from '../../services/compression/types';
import {
  FileVideo,
  Settings,
  Play,
  FolderOpen,
  ArrowLeft,
  FileText,
  AlertCircle,
  X,
  Cpu,
  Zap,
} from 'lucide-react';
import { SimpleConfirmationModal } from '../modals/SimpleConfirmationModal';
import { generateAssContent } from '../../services/subtitle/generator';
import { SubtitleItem } from '../../types/subtitle';
import { CustomSelect } from '../settings/CustomSelect';
import { generateOutputPath, getPathSeparator, removeExtension } from '../../services/utils/path';

interface CompressionPageProps {
  onGoBack?: () => void;
  workspaceSubtitles?: SubtitleItem[];
  workspaceVideoFile?: File | null;
  downloadedVideoPath?: string | null;
  onShowLogs?: () => void;
  onShowSettings?: () => void;
}

type ResolutionPreset = 'original' | '1080p' | '720p' | '480p' | 'custom';

export const CompressionPage: React.FC<CompressionPageProps> = ({
  onGoBack,
  workspaceSubtitles,
  workspaceVideoFile,
  downloadedVideoPath,
  onShowLogs,
  onShowSettings,
}) => {
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

  // Update elapsed time every second during compression
  useEffect(() => {
    if (!compressionStartTime) {
      setElapsedTime('00:00');
      return;
    }
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - compressionStartTime) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      setElapsedTime(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [compressionStartTime]);

  // Hardware acceleration state
  const [hwAccelEnabled, setHwAccelEnabled] = useState(true);
  const [hwAccelInfo, setHwAccelInfo] = useState<HardwareAccelInfo | null>(null);

  // Fetch hardware acceleration info on mount
  useEffect(() => {
    const fetchHwAccelInfo = async () => {
      if (window.electronAPI?.compression?.getHwAccelInfo) {
        try {
          const info = await window.electronAPI.compression.getHwAccelInfo();
          setHwAccelInfo(info);
          console.log('[CompressionPage] Hardware acceleration info:', info);
        } catch (error) {
          console.error('[CompressionPage] Failed to get hardware acceleration info:', error);
        }
      }
    };
    fetchHwAccelInfo();
  }, []);

  // Check for workspace video on mount or update
  useEffect(() => {
    if (workspaceVideoFile && !file) {
      setShowAutoLoadPrompt(true);
    }
  }, [workspaceVideoFile]);

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
  }, [downloadedVideoPath]);

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
        console.error('Failed to load downloaded video:', e);
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

  const handleFileSelect = (f: File) => {
    setFile(f);
    const path = window.electronAPI?.getFilePath(f) || (f as any).path || '';
    setOutputPath(generateOutputPath(path, f.name));
    setShowAutoLoadPrompt(false); // Hide prompt if user manually selects a file
  };

  const handleSelectOutputDir = async () => {
    try {
      const result = await window.electronAPI.download.selectDir();
      if (result.success && result.path && file) {
        const sep = getPathSeparator();
        const name = removeExtension(file.name);
        setOutputPath(`${result.path}${sep}${name}_compressed.mp4`);
      }
    } catch (err) {
      console.error('Failed to select directory', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col p-4 md:p-8">
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col">
        {/* Header */}
        <header
          className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800 shrink-0 window-drag-region"
          style={{ WebkitAppRegion: 'drag' } as any}
        >
          <div className="flex items-center space-x-4">
            {onGoBack && (
              <button
                onClick={onGoBack}
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">视频压制</h1>
              <p className="text-xs text-slate-400">高性能 H.264/H.265 视频编码与字幕内嵌</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {onShowLogs && (
              <button
                onClick={onShowLogs}
                className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors text-sm font-medium group"
                title="查看日志"
              >
                <FileText className="w-4 h-4 text-slate-400 group-hover:text-blue-400 transition-colors" />
                <span className="hidden sm:inline text-slate-300 group-hover:text-white">日志</span>
              </button>
            )}
            {onShowSettings && (
              <button
                onClick={onShowSettings}
                className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors text-sm font-medium group"
              >
                <Settings className="w-4 h-4 text-slate-400 group-hover:text-emerald-400 transition-colors" />
                <span className="hidden sm:inline text-slate-300 group-hover:text-white">设置</span>
              </button>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
          {/* Left Column: Input & Settings */}
          <div className="space-y-6">
            {/* File Input */}
            <div className="space-y-4">
              <div
                className={`relative group p-8 rounded-xl border-2 border-dashed transition-all cursor-pointer text-center
                                    ${file ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-slate-700 hover:border-indigo-500/50 hover:bg-slate-800/50'}
                                `}
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
                    className={`p-4 rounded-full ${file ? 'bg-indigo-500/20' : 'bg-slate-800 group-hover:bg-slate-700'} transition-colors`}
                  >
                    <FolderOpen
                      className={`w-8 h-8 ${file ? 'text-indigo-400' : 'text-slate-400'}`}
                    />
                  </div>
                  {file ? (
                    <div className="space-y-1">
                      <p className="text-lg font-medium text-indigo-300 break-all">
                        {window.electronAPI?.getFilePath(file) || (file as any).path || file.name}
                      </p>
                      <p className="text-sm text-slate-500">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                      {workspaceVideoFile && file === workspaceVideoFile && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-900/50 text-indigo-300 border border-indigo-700/50 mt-2">
                          来自工作区
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-lg font-medium text-slate-300">点击选择视频文件</p>
                      <p className="text-sm text-slate-500">支持 MP4, MKV, FLV 等格式</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Auto-load Prompt */}
              {showAutoLoadPrompt && workspaceVideoFile && (
                <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-lg p-4 flex items-center justify-between animate-fade-in">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/20 rounded-full">
                      <AlertCircle className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-indigo-200">检测到工作区文件</p>
                      <p className="text-xs text-indigo-300/70">是否自动加载视频/音频及字幕？</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowAutoLoadPrompt(false)}
                      className="p-2 hover:bg-indigo-900/40 rounded-lg text-indigo-300/70 hover:text-indigo-200 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleAutoLoad}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors shadow-lg shadow-indigo-500/20"
                    >
                      加载
                    </button>
                  </div>
                </div>
              )}

              {/* Downloaded Video Prompt */}
              {showDownloadedVideoPrompt && downloadedVideoPath && (
                <div className="bg-violet-900/20 border border-violet-500/30 rounded-lg p-4 flex items-center justify-between animate-fade-in">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-violet-500/20 rounded-full">
                      <FileVideo className="w-5 h-5 text-violet-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-violet-200">检测到已下载视频</p>
                      <p className="text-xs text-violet-300/70 truncate max-w-xs">
                        {downloadedVideoPath.split(/[\\/]/).pop()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowDownloadedVideoPrompt(false)}
                      className="p-2 hover:bg-violet-900/40 rounded-lg text-violet-300/70 hover:text-violet-200 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleLoadDownloadedVideo}
                      className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium rounded-lg transition-colors shadow-lg shadow-violet-500/20"
                    >
                      加载
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Settings Panel */}
            <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-800 space-y-6">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2 border-b border-slate-800 pb-4">
                <Settings className="w-5 h-5 text-indigo-400" /> 参数设置
              </h2>

              {/* Encoder */}
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <label className="w-32 text-sm font-medium text-slate-400 shrink-0">编码器</label>
                <div className="flex-1">
                  <CustomSelect
                    value={options.encoder}
                    onChange={(val) => setOptions({ ...options, encoder: val as any })}
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
                </div>
              </div>

              {/* Hardware Acceleration */}
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <label className="w-32 text-sm font-medium text-slate-400 shrink-0">硬件加速</label>
                <div className="flex-1 space-y-2">
                  <button
                    onClick={() => setHwAccelEnabled(!hwAccelEnabled)}
                    className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${
                      hwAccelEnabled
                        ? 'bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20'
                        : 'bg-slate-800 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {hwAccelEnabled ? (
                        <Zap className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <Cpu className="w-5 h-5 text-slate-400" />
                      )}
                      <div className="text-left">
                        <div
                          className={`font-medium ${hwAccelEnabled ? 'text-emerald-300' : 'text-slate-300'}`}
                        >
                          {hwAccelEnabled ? 'GPU 加速已开启' : 'CPU 模式'}
                        </div>
                        <div className="text-xs text-slate-500">
                          {hwAccelEnabled
                            ? hwAccelInfo?.available
                              ? `将使用 ${options.encoder === 'libx264' ? hwAccelInfo.preferredH264 : hwAccelInfo.preferredH265}`
                              : '未检测到 GPU 编码器，将使用 CPU'
                            : '强制使用 CPU 编码'}
                        </div>
                      </div>
                    </div>
                    <div
                      className={`w-10 h-5 rounded-full relative transition-colors ${
                        hwAccelEnabled ? 'bg-emerald-500' : 'bg-slate-600'
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-md transition-all ${
                          hwAccelEnabled ? 'left-5' : 'left-0.5'
                        }`}
                      />
                    </div>
                  </button>
                  {hwAccelInfo?.available && hwAccelEnabled && (
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

              {/* CRF */}
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <label className="w-32 text-sm font-medium text-slate-400 shrink-0">
                  质量 (CRF)
                </label>
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={options.crf.toString()}
                    onChange={(e) => {
                      const input = e.target.value;
                      // Allow empty, numbers, and one decimal point
                      if (input === '' || /^\d*\.?\d*$/.test(input)) {
                        const val = parseFloat(input);
                        if (!isNaN(val) && val >= 0 && val <= 51) {
                          setOptions({ ...options, crf: val });
                        } else if (input === '' || input === '.') {
                          // Allow empty or just decimal for in-progress typing
                        }
                      }
                    }}
                    onBlur={(e) => {
                      // On blur, clamp value to valid range
                      const val = parseFloat(e.target.value);
                      if (isNaN(val) || val < 0) {
                        setOptions({ ...options, crf: 0 });
                      } else if (val > 51) {
                        setOptions({ ...options, crf: 51 });
                      }
                    }}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-3 text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  <div className="text-xs text-slate-500">
                    范围 0-51，数值越小画质越高。推荐：H.264 (23), H.265 (28)
                  </div>
                </div>
              </div>

              {/* Resolution */}
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <label className="w-32 text-sm font-medium text-slate-400 shrink-0">分辨率</label>
                <div className="flex-1 space-y-3">
                  <CustomSelect
                    value={resolutionPreset}
                    onChange={(val) => setResolutionPreset(val as ResolutionPreset)}
                    options={[
                      {
                        value: 'original',
                        label: (
                          <div>
                            <div className="font-medium text-slate-200">原样 (Original)</div>
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
                            <div className="font-medium text-slate-200">自定义 (Custom)</div>
                            <div className="text-xs text-slate-500">手动输入宽高</div>
                          </div>
                        ),
                      },
                    ]}
                  />

                  {resolutionPreset === 'custom' && (
                    <div className="flex gap-4 animate-fade-in">
                      <div className="relative flex-1">
                        <input
                          type="number"
                          value={options.width}
                          onChange={(e) =>
                            setOptions({ ...options, width: parseInt(e.target.value) })
                          }
                          placeholder="宽"
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 px-4 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all no-spinner"
                        />
                        <span className="absolute right-3 top-2.5 text-xs text-slate-500">W</span>
                      </div>
                      <div className="relative flex-1">
                        <input
                          type="number"
                          value={options.height}
                          onChange={(e) =>
                            setOptions({ ...options, height: parseInt(e.target.value) })
                          }
                          placeholder="高"
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 px-4 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all no-spinner"
                        />
                        <span className="absolute right-3 top-2.5 text-xs text-slate-500">H</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Subtitles */}
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <label className="w-32 text-sm font-medium text-slate-400 shrink-0">字幕内嵌</label>
                <div className="flex-1 space-y-3">
                  <CustomSelect
                    value={subtitleMode}
                    onChange={(val) => setSubtitleMode(val as any)}
                    options={[
                      {
                        value: 'none',
                        label: (
                          <div>
                            <div className="font-medium text-slate-200">无 (None)</div>
                            <div className="text-xs text-slate-500">不内嵌字幕</div>
                          </div>
                        ),
                      },
                      {
                        value: 'file',
                        label: (
                          <div>
                            <div className="font-medium text-slate-200">本地文件 (Local File)</div>
                            <div className="text-xs text-slate-500">
                              选择本地 .ass 或 .srt 字幕文件
                            </div>
                          </div>
                        ),
                      },
                      {
                        value: 'workspace',
                        disabled: !workspaceSubtitles || workspaceSubtitles.length === 0,
                        label: (
                          <div>
                            <div className="font-medium text-slate-200">当前工作区 (Workspace)</div>
                            <div className="text-xs text-slate-500">
                              {!workspaceSubtitles || workspaceSubtitles.length === 0
                                ? '当前工作区无字幕'
                                : `自动使用工作区中的 ${workspaceSubtitles.length} 条字幕`}
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
                        placeholder="请选择字幕文件 (.ass, .srt)"
                        className="flex-1 bg-slate-800 border border-slate-700 rounded-lg py-2.5 px-4 text-slate-400 text-sm focus:outline-none"
                      />
                      <button
                        onClick={async () => {
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = '.ass,.srt,.ssa';
                          input.onchange = (e) => {
                            const f = (e.target as HTMLInputElement).files?.[0];
                            if (f) {
                              const path = window.electronAPI?.getFilePath?.(f) || (f as any).path;
                              if (path) setSubtitlePath(path);
                            }
                          };
                          input.click();
                        }}
                        className="bg-slate-700 hover:bg-slate-600 px-4 rounded-lg border border-slate-600 transition-colors"
                      >
                        <FolderOpen className="w-5 h-5 text-slate-300" />
                      </button>
                    </div>
                  )}
                  {subtitleMode === 'workspace' && (
                    <div className="flex items-center gap-2 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
                      <FileText className="w-4 h-4 text-indigo-400" />
                      <span className="text-sm text-indigo-300">
                        将自动生成 ASS 字幕并内嵌到视频中
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Output & Progress */}
          <div className="space-y-6">
            {/* Output Path */}
            <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-800">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2 border-b border-slate-800 pb-4 mb-4">
                <FolderOpen className="w-5 h-5 text-indigo-400" /> 输出设置
              </h2>
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <label className="w-20 text-sm font-medium text-slate-400 shrink-0">输出路径</label>
                <div className="flex-1 flex gap-2">
                  <input
                    type="text"
                    value={outputPath}
                    readOnly
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-lg py-2.5 px-4 text-slate-400 text-sm focus:outline-none"
                  />
                  <button
                    onClick={handleSelectOutputDir}
                    className="bg-slate-700 hover:bg-slate-600 px-4 rounded-lg border border-slate-600 transition-colors text-slate-300 text-sm whitespace-nowrap"
                  >
                    更改目录
                  </button>
                </div>
              </div>
            </div>

            {/* Action Button */}
            <button
              onClick={async () => {
                if (!file || !outputPath) return;

                // Get file path - try getFilePath API first, fallback to path property
                const inputPath = window.electronAPI?.getFilePath?.(file) || (file as any).path;
                if (!inputPath) {
                  alert('无法获取视频文件路径，请重新选择文件');
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
                        true
                      );
                      const res = await window.electronAPI.writeTempFile(assContent, 'ass');
                      if (res.success && res.path) {
                        finalSubtitlePath = res.path;
                      } else {
                        throw new Error('无法创建临时字幕文件: ' + res.error);
                      }
                    } catch (err: any) {
                      throw new Error('字幕生成失败: ' + err.message);
                    }
                  }

                  const cleanup = window.electronAPI.compression.onProgress((p) => setProgress(p));
                  await window.electronAPI.compression.compress(inputPath, outputPath, {
                    ...options,
                    subtitlePath: finalSubtitlePath,
                    hwAccel: hwAccelEnabled ? 'auto' : 'off',
                  });
                  cleanup();
                  setShowSuccessModal(true);
                } catch (e: any) {
                  // Don't show error for user-initiated cancellation
                  if (e.message !== 'CANCELLED') {
                    alert('压制失败: ' + e.message);
                  }
                } finally {
                  setIsCompressing(false);
                  setCompressionStartTime(null);
                  setProgress(null);
                }
              }}
              disabled={!file || isCompressing}
              className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-lg
                                ${
                                  !file || isCompressing
                                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20 hover:shadow-indigo-500/30 border border-indigo-500'
                                }`}
            >
              {isCompressing ? (
                <span className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  压制中...
                </span>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-current" /> 开始压制
                </>
              )}
            </button>

            {/* Progress Card */}
            {progress && (
              <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-800 space-y-4">
                <div className="flex justify-between items-end">
                  <span className="text-3xl font-bold text-white">
                    {progress.percent.toFixed(1)}
                    <span className="text-lg text-slate-500 font-normal">%</span>
                  </span>
                  <div className="text-right">
                    <div className="text-indigo-400 font-mono">
                      {progress.currentFps} <span className="text-xs text-slate-500">FPS</span>
                    </div>
                    <div className="text-xs text-slate-500">{progress.currentKbps} kbps</div>
                  </div>
                </div>

                <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-indigo-600 to-purple-600 h-full rounded-full transition-all duration-300 ease-out relative overflow-hidden"
                    style={{ width: `${progress.percent}%` }}
                  >
                    <div className="absolute inset-0 bg-white/20 animate-shimmer" />
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs text-slate-500 font-mono pt-2 border-t border-slate-800/50">
                  <span>
                    耗时: {elapsedTime} | 进度: {progress.timemark}
                  </span>
                  <span>大小: {(progress.targetSize / 1024).toFixed(2)} MB</span>
                </div>

                {/* Cancel Button */}
                <button
                  onClick={async () => {
                    try {
                      await window.electronAPI.compression.cancel();
                    } catch (e) {
                      console.error('Failed to cancel compression:', e);
                    }
                  }}
                  className="w-full py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 hover:text-red-300 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <X className="w-4 h-4" /> 取消压制
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Success Modal */}
      <SimpleConfirmationModal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        onConfirm={() => {
          if (outputPath) {
            window.electronAPI.showItemInFolder(outputPath);
          }
        }}
        title="压制完成"
        message="视频压制已成功完成！"
        confirmText="打开输出目录"
        cancelText="关闭"
        type="info"
      />
    </div>
  );
};
