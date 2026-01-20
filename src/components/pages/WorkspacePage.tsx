import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileVideo,
  Download,
  Play,
  AlertCircle,
  Loader2,
  FileText,
  Upload,
  Plus,
  Clapperboard,
  Edit2,
  Book,
  Scissors,
  ChevronUp,
  ChevronDown,
  FolderOpen,
  Users,
  Languages,
} from 'lucide-react';
import {
  type SubtitleItem,
  type SubtitleSnapshot,
  type BatchOperationMode,
  type RegeneratePrompts,
} from '@/types/subtitle';
import { type SpeakerUIProfile } from '@/types/speaker';
import { type AppSettings } from '@/types/settings';
import { GenerationStatus } from '@/types/api';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { WorkspaceHeader } from '@/components/layout/WorkspaceHeader';
import { HistoryPanel } from '@/components/layout/HistoryPanel';
import { FileUploader } from '@/components/upload/FileUploader';
import { SubtitleEditor } from '@/components/editor/SubtitleEditor';
import { VideoPlayerPreview } from '@/components/editor/VideoPlayerPreview';
import { useVideoPreview } from '@/hooks/useVideoPreview';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { TargetLanguageSelector } from '@/components/settings/TargetLanguageSelector';
import { Modal } from '@/components/ui/Modal';
import { NumberInput } from '@/components/ui/NumberInput';
import { formatDuration, timeToSeconds } from '@/services/subtitle/time';
import { isVideoFile } from '@/services/utils/file';
import { cn } from '@/lib/cn';

interface WorkspacePageProps {
  activeTab: 'new' | 'import';
  file: File | null;
  duration: number;
  subtitles: SubtitleItem[];
  status: GenerationStatus;
  error: string | null;
  settings: AppSettings;
  snapshots: SubtitleSnapshot[];
  showSnapshots: boolean;
  selectedBatches: Set<number>;
  batchComments: Record<string, string>;
  showSourceText: boolean;
  editingCommentId: string | null;
  isLoadingFile?: boolean;
  isLoadingSubtitle?: boolean;
  subtitleFileName?: string | null;

  // Handlers
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFileChangeNative?: (file: File) => void;
  onFileLoadingStart?: () => void;
  onSubtitleImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubtitleImportNative?: () => void;
  onGenerate: () => void;
  onDownload: (format: 'srt' | 'ass') => void;
  onGoBack: () => void;
  onShowLogs: () => void;
  onShowGlossary: () => void;
  onShowSettings: () => void;
  onShowGenreSettings: () => void;
  onUpdateSetting: (key: keyof AppSettings, value: any) => void;
  onToggleSnapshots: () => void;
  onRestoreSnapshot: (snapshot: SubtitleSnapshot) => void;
  onDeleteSnapshot: (id: string) => void;
  onStartCompression?: () => void;

  // Editor Handlers
  toggleAllBatches: (total: number) => void;
  selectBatchesWithComments: (chunks: SubtitleItem[][]) => void;
  setShowSourceText: (show: boolean) => void;
  handleBatchAction: (
    mode: BatchOperationMode,
    batchIndex?: number,
    prompts?: RegeneratePrompts
  ) => void;
  toggleBatch: (index: number) => void;
  updateBatchComment: (index: number, comment: string) => void;
  setEditingCommentId: (id: string | null) => void;
  updateLineComment: (id: string, comment: string) => void;
  updateSubtitleText: (id: string, translated: string) => void;
  updateSubtitleOriginal: (id: string, original: string) => void;
  updateSpeaker: (id: string, speaker: string, applyToAll?: boolean) => void;
  updateSubtitleTime: (id: string, startTime: string, endTime: string) => void;
  speakerProfiles?: SpeakerUIProfile[];
  onManageSpeakers?: () => void;
  deleteSubtitle?: (id: string) => void;
  deleteMultipleSubtitles?: (ids: string[]) => void;
  addSubtitle?: (referenceId: string, position: 'before' | 'after', defaultTime: string) => void;
}

export const WorkspacePage: React.FC<WorkspacePageProps> = ({
  activeTab,
  file,
  duration,
  subtitles,
  status,
  error,
  settings,
  snapshots,
  showSnapshots,
  selectedBatches,
  batchComments,
  showSourceText,
  editingCommentId,
  onFileChange,
  onFileChangeNative,
  onFileLoadingStart,
  onSubtitleImport,
  onSubtitleImportNative,
  onGenerate,
  onDownload,
  onGoBack,
  onShowLogs,
  onShowGlossary,
  onShowSettings,
  onShowGenreSettings,
  onUpdateSetting,
  onToggleSnapshots,
  onRestoreSnapshot,
  toggleAllBatches,
  selectBatchesWithComments,
  setShowSourceText,
  handleBatchAction,
  toggleBatch,
  updateBatchComment,
  setEditingCommentId,
  updateLineComment,
  updateSubtitleText,
  updateSubtitleOriginal,
  updateSpeaker,
  updateSubtitleTime,
  speakerProfiles,

  onManageSpeakers,
  deleteSubtitle,
  deleteMultipleSubtitles,
  addSubtitle,
  onStartCompression,
  onDeleteSnapshot,
  isLoadingFile = false,
  isLoadingSubtitle = false,
  subtitleFileName,
}) => {
  const { t } = useTranslation('workspace');
  const subtitleListRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isProcessing =
    status === GenerationStatus.UPLOADING ||
    status === GenerationStatus.PROCESSING ||
    status === GenerationStatus.PROOFREADING;
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron;

  // Collapsible sidebar state for small screens (default expanded for better UX)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Collapsible section states
  const [settingsExpanded, setSettingsExpanded] = useState(true);

  // Export modal state
  const [showExportModal, setShowExportModal] = useState(false);

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
    if (file && isVideoFile(file)) {
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
  const MIN_HEIGHT_FOR_TWO_COLUMN = 700; // Minimum height to use two-column layout
  const MIN_WIDTH_FOR_TWO_COLUMN = 768; // Matches md: breakpoint
  const COMPACT_HEIGHT_THRESHOLD = 600; // For auto-collapsing sections

  // Detect viewport dimensions and switch layout accordingly
  useEffect(() => {
    const checkViewportSize = () => {
      // Calculate effective viewport size by compensating for zoom
      // If zoom is 0.5, the effective viewport is 2x larger
      const zoom = settings.zoomLevel || 1;
      const effectiveHeight = window.innerHeight / zoom;
      const effectiveWidth = window.innerWidth / zoom;

      // Force vertical layout if either dimension is too small
      const shouldForceVertical =
        effectiveHeight < MIN_HEIGHT_FOR_TWO_COLUMN || effectiveWidth < MIN_WIDTH_FOR_TWO_COLUMN;

      setForceVerticalLayout(shouldForceVertical);
    };

    // Initial check
    checkViewportSize();

    // Listen for resize
    window.addEventListener('resize', checkViewportSize);
    return () => window.removeEventListener('resize', checkViewportSize);
  }, [settings.zoomLevel]);

  // Auto-detect available height and collapse sections if needed
  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;

    // Small delay to let layout settle
    const timeoutId = setTimeout(() => {
      const availableHeight = sidebar.clientHeight;
      const isCompact = availableHeight > 0 && availableHeight < COMPACT_HEIGHT_THRESHOLD;

      // On compact screens, collapse settings
      if (isCompact) {
        setSettingsExpanded(false);
      } else {
        // Optional: Auto-expand if plenty of space?
        // For now, let's keep it sticky if user expanded it, but we could enforce expand:
        // setSettingsExpanded(true);
        // Decided to only auto-collapse to avoid overriding user preference aggressively.
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [settings.zoomLevel, forceVerticalLayout]);

  // Determine if compression button should show
  // For 'new' tab: requires video file
  // For 'import' tab: requires both video and subtitles
  const canShowCompression =
    isElectron &&
    onStartCompression &&
    ((activeTab === 'new' && isVideoFile(file) && subtitles.length > 0) ||
      (activeTab === 'import' && isVideoFile(file) && subtitles.length > 0));

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
          onShowLogs={onShowLogs}
          onShowGlossary={onShowGlossary}
          onShowSettings={onShowSettings}
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
          <div
            ref={sidebarRef}
            className={cn(
              'workspace-sidebar max-h-[60vh] h-auto overflow-y-auto custom-scrollbar space-y-2 sm:space-y-3',
              (sidebarCollapsed && forceVerticalLayout) || sidebarCollapsed ? 'hidden' : 'block',
              !forceVerticalLayout &&
                'md:block md:col-span-4 lg:col-span-3 md:h-full md:min-h-0 md:max-h-none'
            )}
          >
            {/* Desktop Spacer for Alignment */}
            <div
              className={cn(
                'h-6 mb-1 shrink-0', // Fixed lint
                !forceVerticalLayout ? 'hidden md:block' : 'hidden'
              )}
            ></div>

            <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-xl p-3 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  {t('sidebar.projectFile')}
                </h3>
                {isLoadingFile && (
                  <span className="flex items-center text-xs text-indigo-400">
                    <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                    {t('sidebar.loading')}
                  </span>
                )}
              </div>
              <div className={cn(isLoadingFile && 'opacity-60 pointer-events-none')}>
                {isLoadingFile && !file ? (
                  <div className="flex items-center justify-center h-32 border-2 border-dashed border-brand-purple/20 rounded-lg bg-brand-purple/5">
                    <div className="flex flex-col items-center">
                      <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-2" />
                      <span className="text-sm text-slate-400">{t('sidebar.readingFile')}</span>
                    </div>
                  </div>
                ) : file ? (
                  <FileUploader
                    hasFile={true}
                    fileName={file.name}
                    fileInfo={`${formatDuration(duration)} · ${(file.size / (1024 * 1024)).toFixed(1)}MB`}
                    onFileSelect={onFileChange}
                    onFileSelectNative={onFileChangeNative}
                    onLoadingStart={onFileLoadingStart}
                    useNativeDialog={isElectron}
                    disabled={isProcessing || isLoadingFile}
                    accept="video/*,audio/*"
                    icon={<FileVideo className="text-indigo-400" />}
                    uploadTitle=""
                  />
                ) : (
                  <FileUploader
                    hasFile={false}
                    onFileSelect={onFileChange}
                    onFileSelectNative={onFileChangeNative}
                    onLoadingStart={onFileLoadingStart}
                    useNativeDialog={isElectron}
                    disabled={isLoadingFile}
                    accept="video/*,audio/*"
                    icon={
                      activeTab === 'new' ? (
                        <Upload className="text-indigo-400" />
                      ) : (
                        <Plus className="text-slate-500 group-hover:text-indigo-400" />
                      )
                    }
                    uploadTitle={
                      activeTab === 'new' ? t('sidebar.uploadVideoNew') : t('sidebar.attachMedia')
                    }
                    uploadDescription={
                      activeTab === 'new' ? t('sidebar.startTranscription') : undefined
                    }
                    heightClass={activeTab === 'new' ? 'h-32' : 'h-20'}
                    error={!!error && !file}
                  />
                )}
              </div>
              {activeTab === 'import' && (
                <div className="pt-4 border-t border-slate-100/50">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      {t('sidebar.subtitleFile')}
                    </h3>
                    {subtitles.length > 0 && (
                      <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-medium border border-emerald-100">
                        {t('sidebar.rows', { count: subtitles.length })}
                      </span>
                    )}
                    {isLoadingSubtitle && (
                      <span className="flex items-center text-xs text-emerald-500">
                        <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                        {t('sidebar.parsing')}
                      </span>
                    )}
                  </div>
                  <div className={cn(isLoadingSubtitle && 'opacity-60 pointer-events-none')}>
                    {isLoadingSubtitle && subtitles.length === 0 ? (
                      <div className="flex items-center justify-center h-24 border-2 border-dashed border-emerald-500/30 rounded-lg bg-emerald-500/5">
                        <div className="flex flex-col items-center">
                          <Loader2 className="w-6 h-6 text-emerald-500 animate-spin mb-2" />
                          <span className="text-sm text-slate-500">
                            {t('sidebar.parsingSubtitles')}
                          </span>
                        </div>
                      </div>
                    ) : subtitles.length === 0 ? (
                      <FileUploader
                        hasFile={false}
                        onFileSelect={onSubtitleImport}
                        onNativeClick={onSubtitleImportNative}
                        useNativeDialog={isElectron}
                        disabled={isLoadingSubtitle}
                        accept=".srt,.ass"
                        icon={
                          <FileText className="text-emerald-500 group-hover:text-emerald-400" />
                        }
                        uploadTitle={t('sidebar.importSrtAss')}
                        heightClass="h-24"
                        error={!!error && activeTab === 'import'}
                      />
                    ) : (
                      <FileUploader
                        hasFile={true}
                        fileName={subtitleFileName || undefined}
                        fileInfo={t('sidebar.rows', { count: subtitles.length })}
                        onFileSelect={onSubtitleImport}
                        onNativeClick={onSubtitleImportNative}
                        useNativeDialog={isElectron}
                        disabled={isLoadingSubtitle}
                        accept=".srt,.ass"
                        icon={<FileText className="text-emerald-500" />}
                        uploadTitle=""
                      />
                    )}
                  </div>
                  <div className="mt-1.5 fluid-small text-amber-700 bg-amber-500/10 px-2 py-1.5 rounded border border-amber-500/20">
                    <span className="font-medium">{t('sidebar.hint')}</span>
                    {t('sidebar.hintText')}
                  </div>
                </div>
              )}
              {/* Settings Section - Collapsible */}
              <div className="bg-white/50 rounded-xl border border-slate-200/60 shadow-sm">
                <button
                  onClick={() => setSettingsExpanded(!settingsExpanded)}
                  className="w-full flex items-center justify-between px-2.5 py-2 text-xs text-slate-500 hover:bg-slate-50/80 transition-colors rounded-t-xl"
                >
                  <span className="flex items-center fluid-heading font-bold text-slate-700">
                    <Clapperboard className="w-3 h-3 mr-2" /> {t('sidebar.projectSettings')}
                  </span>
                  {settingsExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                  )}
                </button>
                {settingsExpanded && (
                  <div className="px-2.5 pb-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center text-slate-500 text-xs">
                        <Clapperboard className="w-3 h-3 mr-2" /> {t('sidebar.genre')}
                      </span>
                      <button
                        onClick={onShowGenreSettings}
                        className="flex items-center space-x-1.5 px-2 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors group shadow-sm"
                        title={t('sidebar.editGenre')}
                      >
                        <span className="truncate max-w-25">
                          {settings.genre === 'general'
                            ? t('genres.general')
                            : settings.genre === 'anime'
                              ? t('genres.anime')
                              : settings.genre === 'movie'
                                ? t('genres.movie')
                                : settings.genre === 'news'
                                  ? t('genres.news')
                                  : settings.genre === 'tech'
                                    ? t('genres.tech')
                                    : settings.genre}
                        </span>
                        <Edit2 className="w-3 h-3 text-slate-400 group-hover:text-brand-purple transition-colors" />
                      </button>
                    </div>

                    <div className="flex flex-col space-y-1 pt-2 border-t border-slate-100">
                      <span className="flex items-center text-slate-500 text-xs mb-1">
                        <Book className="w-3 h-3 mr-2" /> {t('sidebar.glossary')}
                      </span>
                      <CustomSelect
                        value={settings.activeGlossaryId || ''}
                        onChange={(val) => onUpdateSetting('activeGlossaryId', val || null)}
                        options={[
                          { value: '', label: t('sidebar.noGlossary') },
                          ...(settings.glossaries?.map((g) => ({
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
                        className="w-full"
                        placeholder={t('sidebar.noGlossary')}
                      />
                    </div>

                    <div className="flex flex-col space-y-1 pt-2 border-t border-slate-100">
                      <span className="flex items-center text-slate-500 text-xs mb-1">
                        <Languages className="w-3 h-3 mr-2" /> {t('sidebar.targetLanguage')}
                      </span>
                      <TargetLanguageSelector
                        value={settings.targetLanguage}
                        onChange={(val) => onUpdateSetting('targetLanguage', val)}
                        variant="inline"
                        className="w-full"
                      />
                    </div>

                    {/* Speaker Count Hints - Only visible when diarization enabled AND in new project mode */}
                    {activeTab === 'new' && settings.enableDiarization && (
                      <div className="flex flex-col space-y-1.5 pt-2 border-t border-slate-100">
                        <span className="text-slate-500 text-xs flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" />
                          {t('sidebar.speakerCount')}
                        </span>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">
                              {t('sidebar.speakerMin')}
                            </span>
                            <NumberInput
                              value={settings.minSpeakers}
                              onChange={(num) => onUpdateSetting('minSpeakers', num)}
                              min={1}
                              max={99}
                              placeholder="-"
                              className="w-12 px-1.5 py-1 text-xs text-center"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">
                              {t('sidebar.speakerMax')}
                            </span>
                            <NumberInput
                              value={settings.maxSpeakers}
                              onChange={(num) => onUpdateSetting('maxSpeakers', num)}
                              min={1}
                              max={99}
                              placeholder="-"
                              className="w-12 px-1.5 py-1 text-xs text-center"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            {activeTab === 'new' && (
              <button
                onClick={onGenerate}
                disabled={isProcessing || !file}
                className={cn(
                  'w-full py-3 px-4 rounded-xl font-semibold text-white shadow-lg transition-all flex items-center justify-center space-x-2',
                  isProcessing || !file
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                    : 'bg-linear-to-r from-brand-purple to-brand-orange hover:from-brand-purple/90 hover:to-brand-orange/90 shadow-brand-purple/25 hover:shadow-brand-purple/40 cursor-pointer'
                )}
              >
                {isProcessing ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Play className="w-5 h-5 fill-current" />
                )}
                <span>
                  {status === GenerationStatus.IDLE ||
                  status === GenerationStatus.COMPLETED ||
                  status === GenerationStatus.ERROR ||
                  status === GenerationStatus.CANCELLED
                    ? t('actions.startProcessing')
                    : t('actions.processing')}
                </span>
              </button>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 flex items-start space-x-2 animate-fade-in shadow-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span className="wrap-break-word w-full">{error}</span>
              </div>
            )}

            {(status === GenerationStatus.COMPLETED ||
              status === GenerationStatus.PROOFREADING ||
              status === GenerationStatus.CANCELLED) &&
              subtitles.length > 0 && (
                <button
                  onClick={() => setShowExportModal(true)}
                  className="w-full py-2 px-3 rounded-lg font-semibold text-white text-sm shadow-lg transition-all flex items-center justify-center space-x-2 bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-500/25 hover:shadow-emerald-500/40 animate-fade-in"
                >
                  <Download className="w-4 h-4" />
                  <span>{t('actions.exportSubtitles')}</span>
                </button>
              )}

            {canShowCompression && (
              <button
                onClick={onStartCompression}
                className="w-full py-2 px-3 rounded-lg font-semibold text-white text-sm shadow-lg transition-all flex items-center justify-center space-x-2 bg-linear-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 shadow-amber-500/20 hover:shadow-amber-500/30 animate-fade-in"
              >
                <Scissors className="w-4 h-4" />
                <span>{t('actions.compressVideo')}</span>
              </button>
            )}
          </div>

          {/* Export Modal */}
          <Modal
            isOpen={showExportModal}
            onClose={() => setShowExportModal(false)}
            title={t('export.title')}
            icon={<Download className="w-5 h-5 mr-2 text-emerald-500" />}
            maxWidth="sm"
          >
            <p className="text-slate-500 text-sm mb-6">
              {t('export.description')}{' '}
              {settings.outputMode === 'bilingual'
                ? t('export.bilingual')
                : t('export.translationOnly')}
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  onDownload('srt');
                  setShowExportModal(false);
                }}
                className="flex flex-col items-center justify-center p-3 bg-white hover:bg-slate-50 border border-slate-200 hover:border-emerald-500/50 rounded-xl transition-all group shadow-sm hover:shadow-md"
              >
                <span className="text-2xl font-bold text-slate-700 group-hover:text-emerald-500 mb-1">
                  .SRT
                </span>
                <span className="text-xs text-slate-500 mt-1">{t('export.srtFormat')}</span>
              </button>
              <button
                onClick={() => {
                  onDownload('ass');
                  setShowExportModal(false);
                }}
                className="flex flex-col items-center justify-center p-3 bg-white hover:bg-slate-50 border border-slate-200 hover:border-brand-purple/50 rounded-xl transition-all group shadow-sm hover:shadow-md"
              >
                <span className="text-2xl font-bold text-slate-700 group-hover:text-brand-purple mb-1">
                  .ASS
                </span>
                <span className="text-xs text-slate-500 mt-1">{t('export.assFormat')}</span>
              </button>
            </div>

            <button
              onClick={() => setShowExportModal(false)}
              className="w-full mt-4 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200/50 hover:border-slate-200 rounded-lg text-slate-500 hover:text-slate-800 text-sm font-medium transition-all"
            >
              {t('export.cancel')}
            </button>
          </Modal>

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
              {showSnapshots ? (
                <ErrorBoundary variant="compact">
                  <HistoryPanel
                    isOpen={showSnapshots}
                    onClose={onToggleSnapshots}
                    snapshots={snapshots}
                    onRestoreSnapshot={onRestoreSnapshot}
                    onDeleteSnapshot={onDeleteSnapshot}
                  />
                </ErrorBoundary>
              ) : (
                <div className="flex flex-col flex-1 relative w-full h-full min-h-0">
                  {/* Video Preview Panel - only show for video files in Electron */}
                  {window.electronAPI && file && isVideoFile(file) && (
                    <ErrorBoundary variant="compact">
                      <VideoPlayerPreview
                        ref={playerRef}
                        videoSrc={videoSrc}
                        subtitles={subtitles}
                        speakerProfiles={speakerProfiles}
                        includeSpeaker={settings.includeSpeakerInExport}
                        useSpeakerColors={settings.useSpeakerColors}
                        isTranscoding={isTranscoding}
                        transcodeProgress={transcodeProgress}
                        transcodedDuration={transcodedDuration}
                        fullVideoDuration={fullVideoDuration}
                        showSourceText={showSourceText}
                        onToggleSourceText={() => setShowSourceText(!showSourceText)}
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
                        isGenerating={isProcessing}
                      />
                    </ErrorBoundary>
                  )}
                  <div className="flex-1 relative w-full h-full min-h-0" ref={subtitleListRef}>
                    <ErrorBoundary>
                      <SubtitleEditor
                        subtitles={subtitles}
                        settings={settings}
                        status={status}
                        activeTab={activeTab}
                        selectedBatches={selectedBatches}
                        toggleAllBatches={toggleAllBatches}
                        selectBatchesWithComments={selectBatchesWithComments}
                        showSourceText={showSourceText}
                        setShowSourceText={setShowSourceText}
                        file={file}
                        handleBatchAction={handleBatchAction}
                        batchComments={batchComments}
                        toggleBatch={toggleBatch}
                        updateBatchComment={updateBatchComment}
                        editingCommentId={editingCommentId}
                        setEditingCommentId={setEditingCommentId}
                        updateLineComment={updateLineComment}
                        updateSubtitleText={updateSubtitleText}
                        updateSubtitleOriginal={updateSubtitleOriginal}
                        updateSpeaker={updateSpeaker}
                        updateSubtitleTime={updateSubtitleTime}
                        speakerProfiles={speakerProfiles}
                        deleteSubtitle={deleteSubtitle}
                        deleteMultipleSubtitles={deleteMultipleSubtitles}
                        addSubtitle={addSubtitle}
                        onManageSpeakers={onManageSpeakers}
                        scrollContainerRef={subtitleListRef}
                        currentPlayTime={currentTime}
                        onRowClick={_handleSubtitleRowClick}
                      />
                    </ErrorBoundary>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
