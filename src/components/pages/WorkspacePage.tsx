import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronUp, ChevronDown, FolderOpen } from 'lucide-react';

import { type SubtitleSnapshot, type SubtitleItem } from '@/types/subtitle';
import { type SpeakerUIProfile } from '@/types/speaker';

import { GenerationStatus } from '@/types/api';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { WorkspaceHeader } from '@/components/layout/WorkspaceHeader';
import { HistoryModal } from '@/components/layout/HistoryModal';
import { PreflightErrorModal } from '@/components/modals/PreflightErrorModal';

import { SubtitleEditor } from '@/components/editor/SubtitleEditor';
import { VideoPlayerPreview } from '@/components/editor/VideoPlayerPreview';
import { WorkspaceSidebar } from '@/components/layout/WorkspaceSidebar';
import { useVideoPreview } from '@/hooks/useVideoPreview';
import { timeToSeconds } from '@/services/subtitle/time';
import { isVideoFile, isAudioFile } from '@/services/utils/file';
import { cn } from '@/lib/cn';
import { useWorkspaceController } from '@/hooks/useWorkspaceLogic/useWorkspaceController';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { useAppStore } from '@/store/useAppStore';

interface WorkspacePageProps {
  activeTab: 'new' | 'import';
  snapshots: SubtitleSnapshot[];

  onGoBack: () => void;
  onToggleSnapshots: () => void;
  onRestoreSnapshot: (snapshot: SubtitleSnapshot) => void;
  onDeleteSnapshot: (id: string) => void;
  onCreateSnapshot?: (
    description: string,
    subtitles: SubtitleItem[],
    batchComments?: Record<string, string>,
    fileId?: string,
    fileName?: string,
    speakerProfiles?: SpeakerUIProfile[]
  ) => void;
  onStartCompression?: () => void;
}

export const WorkspacePage: React.FC<WorkspacePageProps> = ({
  activeTab,
  snapshots,

  onGoBack,
  onToggleSnapshots,
  onRestoreSnapshot,
  onDeleteSnapshot,
  onCreateSnapshot,
  onStartCompression,
}) => {
  const { t } = useTranslation('workspace');

  // Controller
  const controller = useWorkspaceController(activeTab);
  const { settings, fileState, subtitleState, generationState } = controller;

  // Deconstruct state
  const { zoomLevel, showSnapshots } = settings;
  const { file } = fileState;
  const { subtitles } = subtitleState;
  const { status } = generationState;

  // Destructure direct actions for easier usage
  // Removed unused action destructuring (toggleAllBatches, etc)

  // Consume modal actions from store
  const subtitleListRef = useRef<HTMLDivElement>(null);
  // Collapsible sidebar state for small screens (default expanded for better UX)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Video preview hook
  const {
    videoSrc,
    isTranscoding,
    transcodeProgress,
    transcodedDuration,
    fullVideoDuration,
    isCollapsed: videoPreviewCollapsed,
    playerRef,
    prepareVideo,
    seekTo,
    updateTime,
    setIsCollapsed: setVideoPreviewCollapsed,
    currentTime,
  } = useVideoPreview();

  // Prepare video for preview when file changes
  useEffect(() => {
    if (file && (isVideoFile(file) || isAudioFile(file))) {
      void prepareVideo(file);
    }
  }, [file, prepareVideo]);

  // Handle subtitle row click to seek video (will be passed to SubtitleEditor)
  const _handleSubtitleRowClick = useCallback(
    (startTimeStr: string) => {
      // Prevent seeking while transcoding to avoid state mismatches
      if (isTranscoding) return;

      const seconds = timeToSeconds(startTimeStr);
      seekTo(seconds);
    },
    [seekTo, isTranscoding]
  );

  // Force vertical layout when viewport is too small (height or width)
  const [forceVerticalLayout, setForceVerticalLayout] = useState(false);

  // Thresholds for layout switching
  const MIN_HEIGHT_FOR_TWO_COLUMN = 600; // Minimum height to use two-column layout
  const MIN_WIDTH_FOR_TWO_COLUMN = 768; // Matches md: breakpoint
  const COMPACT_HEIGHT_THRESHOLD = 700; // For auto-collapsing sections

  // Detect viewport dimensions and switch layout accordingly
  useEffect(() => {
    const checkViewportSize = () => {
      // Calculate effective viewport size by compensating for zoom
      // If zoom is 0.5, the effective viewport is 2x larger
      const zoom = zoomLevel || 1;
      const effectiveHeight = window.innerHeight / zoom;
      const effectiveWidth = window.innerWidth / zoom;

      // Force vertical layout if either dimension is too small
      const shouldForceVertical =
        effectiveHeight < MIN_HEIGHT_FOR_TWO_COLUMN || effectiveWidth < MIN_WIDTH_FOR_TWO_COLUMN;

      setForceVerticalLayout(shouldForceVertical);

      // Auto-collapse sections on very short screens to maximize editor space
      if (effectiveHeight < COMPACT_HEIGHT_THRESHOLD) {
        setVideoPreviewCollapsed(true);
        setSidebarCollapsed(true);
      }
    };

    // Initial check
    checkViewportSize();

    // Listen for resize
    window.addEventListener('resize', checkViewportSize);
    return () => window.removeEventListener('resize', checkViewportSize);
  }, [zoomLevel, setVideoPreviewCollapsed]);

  // Determine if compression button should show
  // For 'new' tab: requires video file
  // For 'import' tab: requires both video and subtitles
  // Removed canShowCompression as it is now in Sidebar

  // Scroll to bottom on new subtitles
  useEffect(() => {
    if (status === GenerationStatus.PROCESSING && subtitleListRef.current) {
      subtitleListRef.current.scrollTop = subtitleListRef.current.scrollHeight;
    }
  }, [subtitles, status]);

  return (
    <div
      className={cn(
        'h-screen-safe bg-warm-mesh text-slate-800 p-4 md:p-8 flex flex-col overflow-y-auto',
        !forceVerticalLayout && 'md:overflow-hidden'
      )}
    >
      <div className="max-w-screen-2xl mx-auto w-full flex-1 flex flex-col space-y-2 sm:space-y-4">
        <WorkspaceHeader
          title={activeTab === 'new' ? t('header.newProject') : t('header.subtitleEditor')}
          modeLabel={activeTab === 'new' ? t('header.generateMode') : t('header.importMode')}
          subtitleInfo={
            file
              ? file.name
              : subtitles.length > 0
                ? t('header.rowsLoaded', { count: subtitles.length })
                : t('header.noFileSelected')
          }
          onBack={onGoBack}
          showSnapshots={showSnapshots}
          onToggleSnapshots={onToggleSnapshots}
          hasSnapshots={snapshots.length > 0}
        />
        <div
          className={cn(
            'flex-1 flex flex-col gap-2 sm:gap-4 workspace-grid',
            !forceVerticalLayout && 'md:grid md:grid-cols-12 md:min-h-0'
          )}
        >
          {/* Mobile/Compact: Collapsible Sidebar Toggle */}
          <div className={cn(!forceVerticalLayout && 'md:hidden')}>
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="w-full flex items-center justify-between px-4 py-3 bg-white/90 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
            >
              <span className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-indigo-400" />
                {t('sidebar.projectSettings')}
                {file && (
                  <span className="text-xs text-slate-500 truncate max-w-37.5">- {file.name}</span>
                )}
              </span>
              {sidebarCollapsed ? (
                <ChevronDown className="w-4 h-4 text-slate-500" />
              ) : (
                <ChevronUp className="w-4 h-4 text-slate-500" />
              )}
            </button>
          </div>

          {/* Sidebar: Hidden on mobile/compact when collapsed */}
          <WorkspaceSidebar
            activeTab={activeTab}
            onStartCompression={onStartCompression}
            sidebarCollapsed={sidebarCollapsed}
            forceVerticalLayout={forceVerticalLayout}
          />

          <div
            className={cn(
              'flex flex-col h-[60vh] sm:h-[70vh] min-h-0',
              !forceVerticalLayout && 'md:col-span-8 lg:col-span-9 md:h-full'
            )}
          >
            {/* Desktop Spacer for Alignment - matches sidebar spacer */}
            <div
              className={cn(
                'h-6 mb-1 shrink-0',
                !forceVerticalLayout ? 'hidden md:block' : 'hidden'
              )}
            ></div>
            <div className="bg-white/80 backdrop-blur-xl border border-white/20 rounded-xl sm:rounded-2xl overflow-hidden flex flex-col shadow-xl shadow-slate-200/40 relative flex-1 min-h-0">
              <div className="flex flex-col flex-1 relative w-full h-full min-h-0">
                {/* Video Preview Panel - show for video OR audio files in Electron */}
                {window.electronAPI && file && (isVideoFile(file) || isAudioFile(file)) && (
                  <ErrorBoundary variant="compact">
                    <VideoPlayerPreview
                      ref={playerRef}
                      videoSrc={videoSrc}
                      isTranscoding={isTranscoding}
                      transcodeProgress={transcodeProgress}
                      transcodedDuration={transcodedDuration}
                      fullVideoDuration={fullVideoDuration}
                      isCollapsed={videoPreviewCollapsed}
                      onTimeUpdate={updateTime}
                      onToggleCollapse={() => {
                        const newState = !videoPreviewCollapsed;
                        setVideoPreviewCollapsed(newState);
                        // Analytics: Video Preview Toggle
                        if (window.electronAPI?.analytics) {
                          void window.electronAPI.analytics.track(
                            'video_preview_toggle',
                            {
                              state: newState ? 'collapsed' : 'expanded',
                            },
                            'interaction'
                          );
                        }
                      }}
                    />
                  </ErrorBoundary>
                )}
                <div className="flex-1 relative w-full h-full min-h-0" ref={subtitleListRef}>
                  <ErrorBoundary>
                    <SubtitleEditor
                      activeTab={activeTab}
                      scrollContainerRef={subtitleListRef}
                      currentPlayTime={currentTime}
                      onRowClick={_handleSubtitleRowClick}
                      onCreateSnapshot={onCreateSnapshot}
                    />
                  </ErrorBoundary>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <HistoryModal
        isOpen={showSnapshots}
        onClose={onToggleSnapshots}
        snapshots={snapshots}
        onRestoreSnapshot={onRestoreSnapshot}
        onDeleteSnapshot={onDeleteSnapshot}
      />

      {/* Preflight Error Modal */}
      <PreflightErrorModalContainer />
    </div>
  );
};

/**
 * Container component for PreflightErrorModal
 * Reads state from store and handles settings navigation
 */
const PreflightErrorModalContainer: React.FC = () => {
  const {
    preflightErrors,
    showPreflightModal,
    setShowPreflightModal,
    preflightContinueCallback,
    setPreflightContinueCallback,
  } = useWorkspaceStore();
  const { setShowSettings, setSettingsTab } = useAppStore();

  const handleOpenSettings = (tab?: 'services' | 'enhance') => {
    setShowPreflightModal(false);
    setPreflightContinueCallback(null);
    if (tab) {
      setSettingsTab(tab);
    }
    setShowSettings(true);
  };

  return (
    <PreflightErrorModal
      isOpen={showPreflightModal}
      onClose={() => {
        setShowPreflightModal(false);
        setPreflightContinueCallback(null);
      }}
      errors={preflightErrors}
      onOpenSettings={handleOpenSettings}
      onContinue={preflightContinueCallback || undefined}
    />
  );
};
