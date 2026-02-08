import React, { useState, useEffect, useCallback } from 'react';
import { Languages, FileText, Book, Settings, RefreshCw, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader, HeaderButton } from './PageHeader';
import { HelpButton } from './HelpButton';
import { useAppStore } from '@/store/useAppStore';
import { logger } from '@/services/utils/logger';

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
  name: 'aligner' | 'ytdlp' | 'whisper';
  current: string;
  latest: string;
  hasUpdate: boolean;
  downloadUrl?: string;
  releaseUrl?: string;
};

type BinaryUpdateState = {
  checking: boolean;
  updates: BinaryUpdateInfo[];
  downloading: boolean;
  progress: number;
  error: string | null;
};

/**
 * Application header with navigation buttons.
 * Consumes modal visibility actions directly from global store.
 */
export const Header: React.FC = () => {
  const { t } = useTranslation('ui');
  const { t: tSettings } = useTranslation('settings');
  const setShowLogs = useAppStore((s) => s.setShowLogs);
  const setShowGlossaryManager = useAppStore((s) => s.setShowGlossaryManager);
  const setShowSettings = useAppStore((s) => s.setShowSettings);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [binaryUpdate, setBinaryUpdate] = useState<BinaryUpdateState>({
    checking: false,
    updates: [],
    downloading: false,
    progress: 0,
    error: null,
  });

  // Listen for update status changes
  useEffect(() => {
    if (!window.electronAPI?.update) return;

    // Get initial status
    void window.electronAPI.update.getStatus().then(setUpdateStatus);

    // Listen for status changes
    const unsubscribe = window.electronAPI.update.onStatus(setUpdateStatus);
    return () => unsubscribe?.();
  }, []);

  // Check for binary updates on mount (with delay to not block startup)
  useEffect(() => {
    if (!window.electronAPI?.update?.checkBinaries) return;

    const timer = setTimeout(async () => {
      setBinaryUpdate((prev) => ({ ...prev, checking: true }));
      try {
        const result = await window.electronAPI!.update!.checkBinaries();
        if (result.success && result.updates) {
          setBinaryUpdate((prev) => ({
            ...prev,
            updates: result.updates!.filter((u) => u.hasUpdate),
            checking: false,
          }));
        } else {
          setBinaryUpdate((prev) => ({ ...prev, checking: false }));
        }
      } catch (error) {
        logger.error('[Header] Failed to check binary updates', error);
        setBinaryUpdate((prev) => ({ ...prev, checking: false }));
      }
    }, 5000); // Check after 5 seconds

    return () => clearTimeout(timer);
  }, []);

  // Listen for binary download progress
  useEffect(() => {
    if (!window.electronAPI?.update?.onBinaryProgress) return;
    const unsubscribe = window.electronAPI.update.onBinaryProgress((data) => {
      setBinaryUpdate((prev) => ({ ...prev, progress: data.percent }));
    });
    return () => unsubscribe?.();
  }, []);

  const hasBinaryUpdates = binaryUpdate.updates.length > 0;
  const hasAppUpdate =
    updateStatus && !updateStatus.isPortable && updateStatus.status === 'downloaded';
  const isAppDownloading =
    updateStatus && !updateStatus.isPortable && updateStatus.status === 'downloading';

  // Download all binary updates sequentially
  const downloadBinaryUpdates = useCallback(async () => {
    if (!window.electronAPI?.update?.downloadBinary) return;
    // Guard against re-entry
    if (binaryUpdate.downloading) return;

    setBinaryUpdate((prev) => ({ ...prev, downloading: true, progress: 0, error: null }));

    const failedUpdates: string[] = [];

    for (const update of binaryUpdate.updates) {
      if (update.downloadUrl) {
        try {
          const result = await window.electronAPI.update.downloadBinary(
            update.name,
            update.downloadUrl
          );
          if (!result.success) {
            logger.error(`[Header] Failed to download ${update.name}:`, result.error);
            failedUpdates.push(update.name);
          }
        } catch (error) {
          logger.error(`[Header] Failed to download ${update.name}`, error);
          failedUpdates.push(update.name);
        }
      }
    }

    // Update state based on results
    if (failedUpdates.length > 0) {
      setBinaryUpdate((prev) => ({
        ...prev,
        downloading: false,
        progress: 0,
        error: `Failed to update: ${failedUpdates.join(', ')}`,
      }));
    } else {
      // Clear updates after successful download
      setBinaryUpdate((prev) => ({
        ...prev,
        updates: [],
        downloading: false,
        progress: 0,
        error: null,
      }));
    }
  }, [binaryUpdate.updates, binaryUpdate.downloading]);

  // Handle update button click
  const handleUpdateClick = useCallback(async () => {
    // If binary updates available, download them first
    if (hasBinaryUpdates) {
      await downloadBinaryUpdates();
    }

    // If app update is ready, install it
    if (hasAppUpdate) {
      void window.electronAPI?.update?.install();
    }
  }, [hasBinaryUpdates, hasAppUpdate, downloadBinaryUpdates]);

  // Determine what to show
  const showUpdateButton =
    hasBinaryUpdates ||
    hasAppUpdate ||
    isAppDownloading ||
    binaryUpdate.downloading ||
    binaryUpdate.error;

  // Determine button text and style
  const getUpdateButtonContent = () => {
    // Error state - allow retry
    if (binaryUpdate.error) {
      return {
        icon: <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />,
        text: tSettings('about.update.retryUpdate'),
        className: 'bg-red-50 border border-red-200 text-red-600 hover:bg-red-100',
        onClick: () => {
          setBinaryUpdate((prev) => ({ ...prev, error: null }));
          void downloadBinaryUpdates();
        },
        title: binaryUpdate.error,
      };
    }

    // Downloading binary updates
    if (binaryUpdate.downloading) {
      return {
        icon: <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />,
        text: tSettings('about.update.updatingComponents', {
          progress: Math.round(binaryUpdate.progress),
        }),
        className: 'bg-blue-50 border border-blue-200 text-blue-600',
        onClick: undefined,
      };
    }

    // Downloading app update
    if (isAppDownloading) {
      return {
        icon: <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />,
        text: tSettings('about.update.downloading', {
          progress: Math.round(updateStatus!.progress),
        }),
        className: 'bg-blue-50 border border-blue-200 text-blue-600',
        onClick: undefined,
      };
    }

    // Both app and binary updates ready
    if (hasAppUpdate && hasBinaryUpdates) {
      return {
        icon: <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />,
        text: tSettings('about.update.restart'),
        className: 'bg-brand-purple hover:bg-brand-purple/90 text-white shadow-sm',
        onClick: handleUpdateClick,
      };
    }

    // Only app update ready
    if (hasAppUpdate) {
      return {
        icon: <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />,
        text: tSettings('about.update.restart'),
        className: 'bg-brand-purple hover:bg-brand-purple/90 text-white shadow-sm',
        onClick: handleUpdateClick,
      };
    }

    // Only binary updates available
    if (hasBinaryUpdates) {
      return {
        icon: <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />,
        text: tSettings('about.update.componentUpdate'),
        className: 'bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100',
        onClick: handleUpdateClick,
      };
    }

    return null;
  };

  const buttonContent = getUpdateButtonContent();

  return (
    <PageHeader
      title={
        <>
          <span className="bg-linear-to-r from-brand-purple to-brand-orange bg-clip-text text-transparent">
            MioSub
          </span>
        </>
      }
      subtitle={t('header.subtitle')}
      icon={<Languages className="w-5 h-5 sm:w-6 sm:h-6 text-white" />}
      actions={
        <>
          {/* Update Status Button */}
          {showUpdateButton &&
            buttonContent &&
            (buttonContent.onClick ? (
              <button
                onClick={buttonContent.onClick}
                title={buttonContent.title}
                className={`flex items-center space-x-1.5 sm:space-x-2 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg transition-all text-xs sm:text-sm font-medium ${buttonContent.className}`}
              >
                {buttonContent.icon}
                <span className="hidden sm:inline">{buttonContent.text}</span>
              </button>
            ) : (
              <span
                className={`flex items-center space-x-1.5 sm:space-x-2 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium ${buttonContent.className}`}
              >
                {buttonContent.icon}
                <span className="hidden sm:inline">{buttonContent.text}</span>
              </span>
            ))}
          <HeaderButton
            onClick={() => setShowLogs(true)}
            icon={<FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            label={t('header.logs')}
            title={t('header.viewLogs')}
            hoverColor="blue"
          />
          <HeaderButton
            onClick={() => setShowGlossaryManager(true)}
            icon={<Book className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            label={t('header.glossary')}
            title={t('header.manageGlossary')}
            hoverColor="indigo"
          />
          <HeaderButton
            onClick={() => setShowSettings(true)}
            icon={<Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            label={t('header.settings')}
            hoverColor="emerald"
          />
          <HelpButton />
        </>
      }
    />
  );
};
