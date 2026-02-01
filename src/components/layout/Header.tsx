import React, { useState, useEffect } from 'react';
import { Languages, FileText, Book, Settings, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader, HeaderButton } from './PageHeader';
import { HelpButton } from './HelpButton';
import { useAppStore } from '@/store/useAppStore';

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

  // Listen for update status changes
  useEffect(() => {
    if (!window.electronAPI?.update) return;

    // Get initial status
    void window.electronAPI.update.getStatus().then(setUpdateStatus);

    // Listen for status changes
    const unsubscribe = window.electronAPI.update.onStatus(setUpdateStatus);
    return () => unsubscribe?.();
  }, []);

  const handleInstallUpdate = () => {
    void window.electronAPI?.update?.install();
  };

  // Show update button only when downloaded (installed mode) or downloading
  const showUpdateButton =
    updateStatus &&
    !updateStatus.isPortable &&
    (updateStatus.status === 'downloaded' || updateStatus.status === 'downloading');

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
            (updateStatus.status === 'downloaded' ? (
              <button
                onClick={handleInstallUpdate}
                className="flex items-center space-x-1.5 sm:space-x-2 px-2 sm:px-4 py-1.5 sm:py-2 bg-brand-purple hover:bg-brand-purple/90 text-white rounded-lg transition-all text-xs sm:text-sm font-medium shadow-sm"
              >
                <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">{tSettings('about.update.restart')}</span>
              </button>
            ) : (
              <span className="flex items-center space-x-1.5 sm:space-x-2 px-2 sm:px-4 py-1.5 sm:py-2 bg-blue-50 border border-blue-200 text-blue-600 rounded-lg text-xs sm:text-sm font-medium">
                <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                <span className="hidden sm:inline">
                  {tSettings('about.update.downloading', {
                    progress: Math.round(updateStatus.progress),
                  })}
                </span>
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
