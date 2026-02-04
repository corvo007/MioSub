import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Languages,
  Cpu,
  Info,
  Copy,
  ExternalLink,
  RefreshCw,
  Shield,
  Download,
} from 'lucide-react';
import pkg from '../../../../package.json';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { cn } from '@/lib/cn';
import { logger } from '@/services/utils/logger';

// About Tab Cache
let cachedAboutInfo: any = null;
let cachedAboutInfoHash: string | null = null;

type UpdateStatus = {
  status:
    | 'idle'
    | 'checking'
    | 'available'
    | 'not-available'
    | 'downloading'
    | 'downloaded'
    | 'error';
  version: string | null;
  error: string | null;
  progress: number;
  isPortable: boolean;
};

type BinaryUpdateInfo = {
  name: 'aligner' | 'ytdlp';
  current: string;
  latest: string;
  hasUpdate: boolean;
  downloadUrl?: string;
  releaseUrl?: string;
};

type BinaryUpdateState = {
  checking: boolean;
  updates: BinaryUpdateInfo[];
  downloading: { [key: string]: number }; // name -> progress
};

export const AboutTab: React.FC = () => {
  const { t } = useTranslation('settings');
  const [info, setInfo] = useState<any>(cachedAboutInfo);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [binaryUpdate, setBinaryUpdate] = useState<BinaryUpdateState>({
    checking: false,
    updates: [],
    downloading: {},
  });

  const loadAboutInfo = useCallback(async () => {
    if (window.electronAPI?.getAboutInfo) {
      try {
        const data = await window.electronAPI.getAboutInfo(cachedAboutInfoHash || undefined);
        if (data.notModified && cachedAboutInfo) {
          // Data hasn't changed, keep using the cache
          setInfo(cachedAboutInfo);
        } else {
          // Fresh data received
          cachedAboutInfo = data;
          cachedAboutInfoHash = data.hash || null;
          setInfo(data);
        }
      } catch (error) {
        logger.error('[AboutTab] Failed to load info', error);
      }
    }
  }, []);

  useEffect(() => {
    void loadAboutInfo();
  }, [loadAboutInfo]);

  // Update status management
  useEffect(() => {
    if (!window.electronAPI?.update) return;

    // Get initial status
    void window.electronAPI.update.getStatus().then(setUpdateStatus);

    // Listen for status changes
    const unsubscribe = window.electronAPI.update.onStatus(setUpdateStatus);
    return () => unsubscribe?.();
  }, []);

  const handleCheckUpdate = async () => {
    if (!window.electronAPI?.update) return;
    const result = await window.electronAPI.update.check();
    if (result?.downloadUrl) {
      setDownloadUrl(result.downloadUrl);
    }
  };

  const handleDownloadUpdate = () => {
    void window.electronAPI?.update?.download();
  };

  const handleInstallUpdate = () => {
    void window.electronAPI?.update?.install();
  };

  const handleGoToDownload = () => {
    if (downloadUrl) {
      void window.electronAPI?.openExternal(downloadUrl);
    }
  };

  const handleCopy = (text: string) => {
    void navigator.clipboard.writeText(text);
  };

  const handleShowInFolder = (path: string) => {
    void window.electronAPI?.showItemInFolder(path);
  };

  // Binary update handlers
  const handleCheckBinaryUpdates = async () => {
    if (!window.electronAPI?.update?.checkBinaries) return;
    setBinaryUpdate((prev) => ({ ...prev, checking: true }));
    try {
      const result = await window.electronAPI.update.checkBinaries();
      if (result.success && result.updates) {
        setBinaryUpdate((prev) => ({ ...prev, updates: result.updates!, checking: false }));
      } else {
        setBinaryUpdate((prev) => ({ ...prev, checking: false }));
      }
    } catch (error) {
      logger.error('[AboutTab] Failed to check binary updates', error);
      setBinaryUpdate((prev) => ({ ...prev, checking: false }));
    }
  };

  const handleDownloadBinary = async (name: 'aligner' | 'ytdlp', downloadUrl: string) => {
    if (!window.electronAPI?.update?.downloadBinary) return;
    setBinaryUpdate((prev) => ({
      ...prev,
      downloading: { ...prev.downloading, [name]: 0 },
    }));
    try {
      const result = await window.electronAPI.update.downloadBinary(name, downloadUrl);
      if (result.success) {
        // Refresh info after successful update
        void loadAboutInfo();
        // Clear update status for this binary
        setBinaryUpdate((prev) => ({
          ...prev,
          updates: prev.updates.map((u) => (u.name === name ? { ...u, hasUpdate: false } : u)),
          downloading: Object.fromEntries(
            Object.entries(prev.downloading).filter(([k]) => k !== name)
          ),
        }));
      } else {
        logger.error(`[AboutTab] Failed to download ${name}:`, result.error);
        setBinaryUpdate((prev) => ({
          ...prev,
          downloading: Object.fromEntries(
            Object.entries(prev.downloading).filter(([k]) => k !== name)
          ),
        }));
      }
    } catch (error) {
      logger.error(`[AboutTab] Failed to download ${name}`, error);
      setBinaryUpdate((prev) => ({
        ...prev,
        downloading: Object.fromEntries(
          Object.entries(prev.downloading).filter(([k]) => k !== name)
        ),
      }));
    }
  };

  const handleOpenBinaryRelease = (name: 'aligner' | 'ytdlp') => {
    void window.electronAPI?.update?.openBinaryRelease(name);
  };

  // Listen for binary download progress
  useEffect(() => {
    if (!window.electronAPI?.update?.onBinaryProgress) return;
    const unsubscribe = window.electronAPI.update.onBinaryProgress((data) => {
      setBinaryUpdate((prev) => ({
        ...prev,
        downloading: { ...prev.downloading, [data.name]: data.percent },
      }));
    });
    return () => unsubscribe?.();
  }, []);

  return (
    <div className="space-y-6 animate-fade-in text-left">
      {/* App Branding */}
      <div className="flex items-center gap-5 p-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="p-3 bg-linear-to-br from-brand-purple to-brand-orange rounded-xl shadow-lg shadow-brand-purple/20 shrink-0">
          <Languages className="w-8 h-8 text-white" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <span className="bg-linear-to-r from-brand-purple to-brand-orange bg-clip-text text-transparent">
              MioSub
            </span>
          </h1>
          <p className="text-sm text-slate-500 mt-1 font-medium">
            {t('about.tagline', 'AI-powered subtitle generation and translation')}
          </p>
          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <span className="px-3 py-1 bg-brand-purple/10 text-brand-purple text-sm font-bold rounded-lg border border-brand-purple/20">
              v{pkg.version}
            </span>
            {info?.commitHash && (
              <span className="text-slate-500 text-sm">
                {info.commitHash} ({info.isPackaged ? 'prod' : 'dev'})
              </span>
            )}
            {/* Update Status Badge */}
            {updateStatus && (
              <UpdateStatusBadge
                status={updateStatus}
                onCheck={handleCheckUpdate}
                onDownload={handleDownloadUpdate}
                onInstall={handleInstallUpdate}
                onGoToDownload={handleGoToDownload}
              />
            )}
          </div>
        </div>
      </div>

      {/* Dependency Versions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionHeader icon={<Cpu className="w-4 h-4" />}>
            {t('about.dependencies', 'Dependencies')}
          </SectionHeader>
          <button
            onClick={handleCheckBinaryUpdates}
            disabled={binaryUpdate.checking}
            className="px-3 py-1.5 text-xs text-slate-600 hover:text-brand-purple border border-slate-200 hover:border-brand-purple/30 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', binaryUpdate.checking && 'animate-spin')} />
            {t('about.checkBinaryUpdates', 'Check Updates')}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { label: t('about.ffmpeg', 'FFmpeg'), value: info?.versions.ffmpeg, key: 'ffmpeg' },
            { label: t('about.ffprobe', 'FFprobe'), value: info?.versions.ffprobe, key: 'ffprobe' },
            { label: t('about.ytdlp', 'yt-dlp'), value: info?.versions.ytdlp, key: 'ytdlp' },
            { label: t('about.qjs', 'QuickJS'), value: info?.versions.qjs, key: 'qjs' },
            {
              label: t('about.whisper', 'Whisper.cpp'),
              value: info?.versions.whisper,
              key: 'whisper',
            },
            { label: t('about.aligner', 'Aligner'), value: info?.versions.aligner, key: 'aligner' },
          ].map((item) => {
            const updateInfo = binaryUpdate.updates.find((u) => u.name === item.key);
            const isDownloading = item.key in binaryUpdate.downloading;
            const downloadProgress = binaryUpdate.downloading[item.key];

            return (
              <div
                key={item.label}
                className={cn(
                  'px-4 py-3 bg-white rounded-xl border shadow-sm flex items-center gap-3 transition-colors',
                  updateInfo?.hasUpdate ? 'border-brand-purple/30' : 'border-slate-200'
                )}
              >
                <span className="text-sm text-slate-500 whitespace-nowrap shrink-0">
                  {item.label}
                </span>
                <span className="text-sm text-slate-900 flex-1 truncate">
                  {item.value || '...'}
                </span>
                {/* Update indicator */}
                {updateInfo?.hasUpdate && !isDownloading && (
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-brand-purple">{updateInfo.latest}</span>
                    {updateInfo.downloadUrl ? (
                      <button
                        onClick={() =>
                          handleDownloadBinary(updateInfo.name, updateInfo.downloadUrl!)
                        }
                        className="p-1 text-brand-purple hover:bg-brand-purple/10 rounded transition-colors"
                        title={t('about.downloadUpdate', 'Download Update')}
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleOpenBinaryRelease(updateInfo.name)}
                        className="p-1 text-brand-purple hover:bg-brand-purple/10 rounded transition-colors"
                        title={t('about.viewRelease', 'View Release')}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
                {/* Download progress */}
                {isDownloading && (
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-purple transition-all"
                        style={{ width: `${downloadProgress}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500">{Math.round(downloadProgress)}%</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* GPU Acceleration Status */}
      <div className="space-y-3">
        <SectionHeader icon={<Cpu className="w-4 h-4" />}>
          {t('about.gpu', 'GPU Acceleration')}
        </SectionHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div
            className={cn(
              'p-4 rounded-xl border flex items-center justify-between',
              info?.gpu.available
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-slate-50 border-slate-200 text-slate-500'
            )}
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'w-2 h-2 rounded-full',
                  info?.gpu.available ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                )}
              />
              <span className="text-sm font-medium">
                {!info
                  ? '...'
                  : info.gpu.available
                    ? t('about.gpuSupported', {
                        preferredH264: info.gpu.preferredH264,
                        preferredH265: info.gpu.preferredH265,
                      })
                    : t('about.gpuUnsupported', 'Not Supported')}
              </span>
            </div>
            <span className="text-[10px] uppercase font-bold tracking-wider opacity-60">
              Encoder
            </span>
          </div>

          <div
            className={cn(
              'p-4 rounded-xl border flex items-center justify-between',
              info?.versions.whisperDetails.gpuSupport
                ? 'bg-brand-purple/10 border-brand-purple/20 text-brand-purple'
                : 'bg-slate-50 border-slate-200 text-slate-500'
            )}
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'w-2 h-2 rounded-full',
                  info?.versions.whisperDetails.gpuSupport
                    ? 'bg-brand-purple animate-pulse'
                    : 'bg-slate-400'
                )}
              />
              <span className="text-sm font-medium">
                {!info
                  ? '...'
                  : info.versions.whisperDetails.gpuSupport
                    ? t('about.whisperGpuSupported', 'Supported (GPU)')
                    : t('about.gpuUnsupported', 'Not Supported')}
              </span>
            </div>
            <span className="text-[10px] uppercase font-bold tracking-wider opacity-60">
              Whisper
            </span>
          </div>
        </div>
      </div>

      {/* System Paths */}
      <div className="space-y-3">
        <SectionHeader icon={<Info className="w-4 h-4" />}>
          {t('about.paths', 'System Paths')}
        </SectionHeader>
        <div className="space-y-2">
          {[
            { label: t('about.appPath', 'App Path'), value: info?.paths.appPath },
            { label: t('about.userDataPath', 'User Data'), value: info?.paths.userDataPath },
            { label: t('about.logPath', 'Log Path'), value: info?.paths.logPath },
            { label: t('about.exePath', 'Executable'), value: info?.paths.exePath },
            {
              label: t('debug.whisperPath', 'Whisper Path'),
              value: info?.versions.whisperDetails.path,
            },
          ].map((pathItem) => (
            <div
              key={pathItem.label}
              className="group p-3 bg-white rounded-xl border border-slate-200 shadow-sm space-y-2 transition-colors hover:border-brand-purple/30"
            >
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-tight">
                  {pathItem.label}
                </span>
                {pathItem.value && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleCopy(pathItem.value)}
                      className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition-colors"
                      title={t('about.copyPath', 'Copy Path')}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleShowInFolder(pathItem.value)}
                      className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition-colors"
                      title={t('about.showInFolder', 'Show in Folder')}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
              <p className="text-sm text-slate-700 break-all line-clamp-2">
                {pathItem.value || '...'}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Data & Privacy */}
      <div className="space-y-3">
        <SectionHeader icon={<Shield className="w-4 h-4" />}>
          {t('about.privacy.title', 'Data & Privacy')}
        </SectionHeader>
        <p className="text-sm text-slate-500 px-1">{t('about.privacy.description')}</p>
      </div>
    </div>
  );
};

// Update Status Badge Component
const UpdateStatusBadge: React.FC<{
  status: UpdateStatus;
  onCheck: () => void;
  onDownload: () => void;
  onInstall: () => void;
  onGoToDownload: () => void;
}> = ({ status, onCheck, onDownload, onInstall, onGoToDownload }) => {
  const { t } = useTranslation('settings');

  // Portable mode: show check button and status
  if (status.isPortable) {
    switch (status.status) {
      case 'idle':
        return (
          <button
            onClick={onCheck}
            className="px-3 py-1 text-sm text-slate-600 hover:text-brand-purple border border-slate-200 hover:border-brand-purple/30 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t('about.update.checkNow')}
          </button>
        );
      case 'checking':
        return (
          <span className="px-3 py-1 text-sm text-slate-500 bg-slate-100 rounded-lg flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            {t('about.update.checking')}
          </span>
        );
      case 'not-available':
        return (
          <span className="px-3 py-1 text-sm text-emerald-600 bg-emerald-50 rounded-lg border border-emerald-200">
            {t('about.update.upToDate')}
          </span>
        );
      case 'available':
        return (
          <button
            onClick={onGoToDownload}
            className="px-3 py-1 text-sm text-brand-purple bg-brand-purple/10 hover:bg-brand-purple/20 rounded-lg border border-brand-purple/20 transition-colors flex items-center gap-1"
          >
            {t('about.update.available', { version: status.version })}
            <ExternalLink className="w-3 h-3" />
          </button>
        );
      case 'error':
        return (
          <button
            onClick={onCheck}
            className="px-3 py-1 text-sm text-red-600 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-colors"
            title={status.error || ''}
          >
            {t('about.update.error')}
          </button>
        );
      default:
        return null;
    }
  }

  // Installed mode: show auto-update status
  switch (status.status) {
    case 'idle':
    case 'not-available':
      return (
        <span className="px-3 py-1 text-sm text-emerald-600 bg-emerald-50 rounded-lg border border-emerald-200">
          {t('about.update.upToDate')}
        </span>
      );
    case 'checking':
      return (
        <span className="px-3 py-1 text-sm text-slate-500 bg-slate-100 rounded-lg flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          {t('about.update.checking')}
        </span>
      );
    case 'available':
      return (
        <button
          onClick={onDownload}
          className="px-3 py-1 text-sm text-brand-purple bg-brand-purple/10 hover:bg-brand-purple/20 rounded-lg border border-brand-purple/20 transition-colors"
        >
          {t('about.update.available', { version: status.version })}
        </button>
      );
    case 'downloading':
      return (
        <span className="px-3 py-1 text-sm text-blue-600 bg-blue-50 rounded-lg border border-blue-200">
          {t('about.update.downloading', { progress: Math.round(status.progress) })}
        </span>
      );
    case 'downloaded':
      return (
        <button
          onClick={onInstall}
          className="px-3 py-1 text-sm text-white bg-brand-purple hover:bg-brand-purple/90 rounded-lg transition-colors"
        >
          {t('about.update.restart')}
        </button>
      );
    case 'error':
      return (
        <span
          className="px-3 py-1 text-sm text-red-600 bg-red-50 rounded-lg border border-red-200"
          title={status.error || ''}
        >
          {t('about.update.error')}
        </span>
      );
    default:
      return null;
  }
};
