import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { GenerationStatus } from '@/types/api';

import { GlossaryManager } from '@/components/glossary/GlossaryManager';
import { SettingsModal, GenreSettingsDialog } from '@/components/settings';
import {
  GlossaryExtractionFailedDialog,
  GlossaryConfirmationModal,
  SimpleConfirmationModal,
  SpeakerManagerModal,
  CloseConfirmModal,
} from '@/components/modals';
import { ToastContainer, ProgressOverlay } from '@/components/ui';

// Custom Hooks
import {
  useSnapshots,
  useGlossaryFlow,
  useWorkspaceLogic,
  useLogs,
  useSnapshotRestore,
} from '@/hooks';
import { getActiveGlossaryTerms } from '@/services/glossary/utils';
import { useEndToEndSubtitleGeneration } from '@/hooks/useEndToEndSubtitleGeneration';

// Global Store
import { useAppStore, initializeSettings } from '@/store/useAppStore';

// Page Components
import { LogViewerModal } from '@/components/layout/LogViewerModal';
import { HomePage } from '@/components/pages/HomePage';
import { WorkspacePage } from '@/components/pages/WorkspacePage';
import { DownloadPage } from '@/components/pages';
import { CompressionPage } from '@/components/pages/CompressionPage';
import { EndToEndWizard } from '@/components/endToEnd';

import { ENV } from '@/config';

export default function App() {
  const { t } = useTranslation('app');
  // View State
  // View State
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);

  const [activeTab, setActiveTab] = useState<'new' | 'import'>('new');

  // Downloaded video path - for passing to compression page
  const [downloadedVideoPath, setDownloadedVideoPath] = useState<string | null>(null);

  // Global Store (Zustand)
  const settings = useAppStore((s) => s.settings);
  const isSettingsLoaded = useAppStore((s) => s.isSettingsLoaded);
  const updateSetting = useAppStore((s) => s.updateSetting);
  const toasts = useAppStore((s) => s.toasts);
  const addToast = useAppStore((s) => s.addToast);
  const removeToast = useAppStore((s) => s.removeToast);

  const setShowSettings = useAppStore((s) => s.setShowSettings);
  const showLogs = useAppStore((s) => s.showLogs);
  const setShowLogs = useAppStore((s) => s.setShowLogs);
  const showGlossaryManager = useAppStore((s) => s.showGlossaryManager);
  const setShowGlossaryManager = useAppStore((s) => s.setShowGlossaryManager);
  const showSpeakerManager = useAppStore((s) => s.showSpeakerManager);
  const setShowSpeakerManager = useAppStore((s) => s.setShowSpeakerManager);
  const showSnapshots = useAppStore((s) => s.showSnapshots);
  const setShowSnapshots = useAppStore((s) => s.setShowSnapshots);
  const showGenreSettings = useAppStore((s) => s.showGenreSettings);
  const setShowGenreSettings = useAppStore((s) => s.setShowGenreSettings);

  // Custom Hooks
  const snapshotsValues = useSnapshots();
  const glossaryFlow = useGlossaryFlow();

  // End-to-End Subtitle Generation Handler
  // This hook listens for IPC requests from main process and executes generation
  useEndToEndSubtitleGeneration({ settings, updateSetting });

  // Initialize language from settings on app startup
  useEffect(() => {
    if (isSettingsLoaded && settings.language) {
      if (i18n.language !== settings.language) {
        void i18n.changeLanguage(settings.language);
      }
    }
  }, [isSettingsLoaded, settings.language]);

  // Analytics: Track Page Views
  useEffect(() => {
    if (window.electronAPI?.analytics) {
      void window.electronAPI.analytics.track('page_view', { name: view }, 'page_view');
    }
  }, [view]);

  // Close Confirmation Modal State
  const [closeConfirm, setCloseConfirm] = useState<{
    isOpen: boolean;
    tasks: Array<{ type: string; description: string }>;
  }>({
    isOpen: false,
    tasks: [],
  });

  // Listen for close requests from main process
  useEffect(() => {
    const cleanup = window.electronAPI?.app?.onCloseRequested((tasks) => {
      setCloseConfirm({ isOpen: true, tasks });
    });
    return () => cleanup?.();
  }, []);

  // Confirmation Modal State
  const [confirmation, setConfirmation] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type?: 'info' | 'warning' | 'danger';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    type: 'warning',
  });

  const showConfirm = useCallback(
    (
      title: string,
      message: string,
      onConfirm: () => void,
      type: 'info' | 'warning' | 'danger' = 'warning'
    ) => {
      setConfirmation({ isOpen: true, title, message, onConfirm, type });
    },
    []
  );

  // Workspace Logic
  const workspace = useWorkspaceLogic({
    addToast,
    showConfirm,
    glossaryFlow,
    snapshotsValues,
    setShowSettings,
  });

  // Custom Hook: Snapshot Restore
  const { handleRestoreSnapshot } = useSnapshotRestore({
    workspace: workspace as any, // Cast to any to bypass strict type check for now, or match interface
    snapshotsValues,
    showConfirm,
    setShowSnapshots,
  });

  // Memoize speakerCounts to avoid recomputing on every render (Audit fix)
  const speakerCounts = useMemo(() => {
    return workspace.subtitles.reduce(
      (acc, sub) => {
        if (sub.speaker) {
          acc[sub.speaker] = (acc[sub.speaker] || 0) + 1;
        }
        return acc;
      },
      {} as Record<string, number>
    );
  }, [workspace.subtitles]);

  // Custom Hook: Logs
  const logs = useLogs();

  // Initialize settings from storage on mount
  useEffect(() => {
    void initializeSettings();
  }, []);

  // Navigation Handlers
  const goBackHome = () => {
    // Preserve workspace state when navigating back
    setView('home');
  };

  return (
    <>
      <GlossaryConfirmationModal
        isOpen={glossaryFlow.showGlossaryConfirmation}
        pendingResults={glossaryFlow.pendingGlossaryResults}
        settings={settings}
        onConfirm={(items) => glossaryFlow.glossaryConfirmCallback?.(items)}
        onUpdateSetting={updateSetting}
      />
      <GlossaryExtractionFailedDialog
        isOpen={glossaryFlow.showGlossaryFailure}
        isGeneratingGlossary={glossaryFlow.isGeneratingGlossary}
        glossaryConfirmCallback={glossaryFlow.glossaryConfirmCallback}
        onRetry={workspace.handleRetryGlossary}
        onContinue={() => {
          glossaryFlow.setShowGlossaryFailure(false);
          if (glossaryFlow.glossaryConfirmCallback) {
            glossaryFlow.glossaryConfirmCallback(getActiveGlossaryTerms(settings));
            glossaryFlow.setGlossaryConfirmCallback(null);
          }
        }}
      />
      <SettingsModal
        envGeminiKey={ENV.GEMINI_API_KEY}
        envOpenaiKey={ENV.OPENAI_API_KEY}
        onOpenGlossaryManager={() => {
          setShowSettings(false);
          setShowGlossaryManager(true);
        }}
      />
      {showGlossaryManager && (
        <GlossaryManager
          glossaries={settings.glossaries || []}
          activeGlossaryId={settings.activeGlossaryId || null}
          onUpdateGlossaries={(updated) => updateSetting('glossaries', updated)}
          onSetActiveGlossary={(id) => updateSetting('activeGlossaryId', id)}
          onClose={() => setShowGlossaryManager(false)}
        />
      )}
      <LogViewerModal isOpen={showLogs} logs={logs} onClose={() => setShowLogs(false)} />
      {view === 'home' && (
        <HomePage
          onStartNew={() => {
            // If there are existing subtitles, ask user before clearing
            if (workspace.subtitles.length > 0) {
              showConfirm(
                t('confirmations.switchToNew.title'),
                t('confirmations.switchToNew.message'),
                () => {
                  workspace.resetWorkspace();
                  setActiveTab('new');
                  setView('workspace');
                },
                'warning'
              );
            } else {
              setActiveTab('new');
              setView('workspace');
            }
          }}
          onStartImport={() => {
            setActiveTab('import');
            setView('workspace');
          }}
          onStartDownload={() => setView('download')}
          onStartCompression={() => setView('compression')}
          onStartEndToEnd={() => setView('endToEnd')}
        />
      )}
      {view === 'download' && (
        <DownloadPage
          onGoBack={() => setView('home')}
          onDownloadComplete={(videoPath) => {
            setDownloadedVideoPath(videoPath);
            setActiveTab('new');
            setView('workspace');
            workspace.resetWorkspace();
            void workspace.loadFileFromPath(videoPath);
          }}
        />
      )}
      {view === 'compression' && (
        <CompressionPage
          onGoBack={() => setView('home')}
          workspaceSubtitles={workspace.subtitles}
          workspaceVideoFile={workspace.file}
          workspaceSpeakerProfiles={workspace.speakerProfiles}
          downloadedVideoPath={downloadedVideoPath}
        />
      )}
      {view === 'endToEnd' && (
        <EndToEndWizard
          settings={settings}
          onComplete={() => setView('home')}
          onCancel={() => setView('home')}
        />
      )}
      {view === 'workspace' && (
        <WorkspacePage
          activeTab={activeTab}
          snapshots={snapshotsValues.snapshots}
          onGoBack={goBackHome}
          onToggleSnapshots={() => setShowSnapshots(!showSnapshots)}
          onRestoreSnapshot={handleRestoreSnapshot}
          onStartCompression={() => setView('compression')}
          onDeleteSnapshot={snapshotsValues.deleteSnapshot}
          onCreateSnapshot={snapshotsValues.createSnapshot}
        />
      )}
      <GenreSettingsDialog
        isOpen={showGenreSettings}
        onClose={() => setShowGenreSettings(false)}
        currentGenre={settings.genre}
        onSave={(genre) => updateSetting('genre', genre)}
      />
      <ProgressOverlay
        isProcessing={
          workspace.status === GenerationStatus.UPLOADING ||
          workspace.status === GenerationStatus.PROCESSING ||
          workspace.status === GenerationStatus.PROOFREADING
        }
        chunkProgress={workspace.chunkProgress}
        status={workspace.status}
        startTime={workspace.startTime || 0}
        onShowLogs={() => setShowLogs(true)}
        onCancel={workspace.cancelOperation}
      />
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <SpeakerManagerModal
        isOpen={showSpeakerManager}
        onClose={() => setShowSpeakerManager(false)}
        speakerProfiles={workspace.speakerProfiles}
        speakerCounts={speakerCounts}
        onRename={workspace.renameSpeaker}
        onDelete={workspace.deleteSpeaker}
        onMerge={workspace.mergeSpeakers}
        onCreate={workspace.addSpeaker}
        onUpdateColor={workspace.updateSpeakerColor}
      />
      <SimpleConfirmationModal
        isOpen={confirmation.isOpen}
        onClose={() => setConfirmation((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmation.onConfirm}
        title={confirmation.title}
        message={confirmation.message}
        type={confirmation.type}
      />
      <CloseConfirmModal
        isOpen={closeConfirm.isOpen}
        tasks={closeConfirm.tasks}
        onKeepRunning={() => setCloseConfirm({ isOpen: false, tasks: [] })}
        onCloseAnyway={() => {
          setCloseConfirm({ isOpen: false, tasks: [] });
          window.electronAPI?.app?.forceClose();
        }}
      />
    </>
  );
}
