import React, { useRef, useEffect, useState } from 'react';
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
} from 'lucide-react';
import { SubtitleItem, SubtitleSnapshot, BatchOperationMode } from '@/types/subtitle';
import { SpeakerUIProfile } from '@/types/speaker';
import { AppSettings } from '@/types/settings';
import { GenerationStatus } from '@/types/api';
import { WorkspaceHeader } from '@/components/layout/WorkspaceHeader';
import { HistoryPanel } from '@/components/layout/HistoryPanel';
import { FileUploader } from '@/components/upload/FileUploader';
import { SubtitleEditor } from '@/components/editor/SubtitleEditor';
import { CustomSelect } from '@/components/settings';
import { Modal } from '@/components/ui/Modal';
import { NumberInput } from '@/components/ui/NumberInput';
import { formatDuration } from '@/services/subtitle/time';
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
  handleBatchAction: (mode: BatchOperationMode, batchIndex: number, prompt?: string) => void;
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
        'h-screen-safe bg-slate-950 text-slate-200 p-4 md:p-8 flex flex-col overflow-y-auto',
        !forceVerticalLayout && 'md:overflow-hidden'
      )}
    >
      <div className="max-w-screen-2xl mx-auto w-full flex-1 flex flex-col space-y-2 sm:space-y-4">
        <WorkspaceHeader
          title={activeTab === 'new' ? '新建项目' : '字幕编辑器'}
          modeLabel={activeTab === 'new' ? '生成模式' : '导入模式'}
          subtitleInfo={
            file ? file.name : subtitles.length > 0 ? `${subtitles.length} 行已加载` : '未选择文件'
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
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-900/80 border border-slate-800 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors"
            >
              <span className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-indigo-400" />
                项目设置
                {file && (
                  <span className="text-xs text-slate-500 truncate max-w-[150px]">
                    - {file.name}
                  </span>
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
                'h-6 mb-1 shrink-0',
                !forceVerticalLayout ? 'hidden md:block' : 'hidden'
              )}
            ></div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="fluid-heading font-semibold text-slate-300">项目文件</h3>
                {isLoadingFile && (
                  <span className="flex items-center text-xs text-indigo-400">
                    <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                    加载中
                  </span>
                )}
              </div>
              <div className={cn(isLoadingFile && 'opacity-60 pointer-events-none')}>
                {isLoadingFile && !file ? (
                  <div className="flex items-center justify-center h-32 border-2 border-dashed border-indigo-500/50 rounded-lg bg-indigo-500/5">
                    <div className="flex flex-col items-center">
                      <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-2" />
                      <span className="text-sm text-slate-400">正在读取文件...</span>
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
                    uploadTitle={activeTab === 'new' ? '上传视频 / 音频' : '附加媒体 (可选)'}
                    uploadDescription={activeTab === 'new' ? '开始转录' : undefined}
                    heightClass={activeTab === 'new' ? 'h-32' : 'h-20'}
                    error={!!error && !file}
                  />
                )}
              </div>
              {activeTab === 'import' && (
                <div className="pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="fluid-heading font-semibold text-slate-400">字幕文件</h3>
                    {subtitles.length > 0 && (
                      <span className="text-[10px] text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">
                        {subtitles.length} 行
                      </span>
                    )}
                    {isLoadingSubtitle && (
                      <span className="flex items-center text-xs text-emerald-400">
                        <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                        解析中
                      </span>
                    )}
                  </div>
                  <div className={cn(isLoadingSubtitle && 'opacity-60 pointer-events-none')}>
                    {isLoadingSubtitle && subtitles.length === 0 ? (
                      <div className="flex items-center justify-center h-24 border-2 border-dashed border-emerald-500/50 rounded-lg bg-emerald-500/5">
                        <div className="flex flex-col items-center">
                          <Loader2 className="w-6 h-6 text-emerald-400 animate-spin mb-2" />
                          <span className="text-sm text-slate-400">正在解析字幕...</span>
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
                        uploadTitle="导入 .SRT / .ASS"
                        heightClass="h-24"
                        error={!!error && activeTab === 'import'}
                      />
                    ) : (
                      <FileUploader
                        hasFile={true}
                        fileName={subtitleFileName || undefined}
                        fileInfo={`${subtitles.length} 行`}
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
                  <div className="mt-1.5 fluid-small text-amber-300 bg-amber-500/10 px-2 py-1.5 rounded border border-amber-500/30">
                    <span className="font-medium">💡 提示：</span>
                    仅完全支持本程序生成的字幕格式
                  </div>
                </div>
              )}
              {/* Settings Section - Collapsible */}
              <div className="bg-slate-800/50 rounded border border-slate-700/50">
                <button
                  onClick={() => setSettingsExpanded(!settingsExpanded)}
                  className="w-full flex items-center justify-between px-2.5 py-2 text-xs text-slate-400 hover:bg-slate-800/50 transition-colors"
                >
                  <span className="flex items-center fluid-heading font-medium text-slate-300">
                    <Clapperboard className="w-3 h-3 mr-2" /> 项目设置
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
                        <Clapperboard className="w-3 h-3 mr-2" /> 类型
                      </span>
                      <button
                        onClick={onShowGenreSettings}
                        className="flex items-center space-x-1.5 px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-xs font-medium text-slate-300 hover:text-white transition-colors group"
                        title="编辑类型 / 上下文"
                      >
                        <span className="truncate max-w-[100px]">
                          {settings.genre === 'general'
                            ? '通用'
                            : settings.genre === 'anime'
                              ? '动漫'
                              : settings.genre === 'movie'
                                ? '电影'
                                : settings.genre === 'news'
                                  ? '新闻'
                                  : settings.genre === 'tech'
                                    ? '科技'
                                    : settings.genre}
                        </span>
                        <Edit2 className="w-3 h-3 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                      </button>
                    </div>

                    <div className="flex flex-col space-y-1 pt-2 border-t border-slate-700/50">
                      <span className="flex items-center text-slate-500 text-xs mb-1">
                        <Book className="w-3 h-3 mr-2" /> 术语表
                      </span>
                      <CustomSelect
                        value={settings.activeGlossaryId || ''}
                        onChange={(val) => onUpdateSetting('activeGlossaryId', val || null)}
                        options={[
                          { value: '', label: '(无)' },
                          ...(settings.glossaries?.map((g) => ({
                            value: g.id,
                            label: (
                              <div className="flex items-center justify-between w-full min-w-0">
                                <span className="truncate mr-2">{g.name}</span>
                                <span className="text-slate-500 text-xs flex-shrink-0">
                                  ({g.terms?.length || 0})
                                </span>
                              </div>
                            ),
                          })) || []),
                        ]}
                        className="w-full"
                        placeholder="(无)"
                      />
                    </div>

                    {/* Speaker Count Hints - Only visible when diarization enabled */}
                    {settings.enableDiarization && (
                      <div className="flex flex-col space-y-1.5 pt-2 border-t border-slate-700/50">
                        <span className="text-slate-500 text-xs flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" />
                          说话人数量 (可选)
                        </span>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">最少</span>
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
                            <span className="text-xs text-slate-400">最多</span>
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
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                    : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-indigo-500/25 hover:shadow-indigo-500/40 cursor-pointer'
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
                    ? '开始处理'
                    : '处理中...'}
                </span>
              </button>
            )}

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 flex items-start space-x-2 animate-fade-in">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span className="break-words w-full">{error}</span>
              </div>
            )}

            {(status === GenerationStatus.COMPLETED || status === GenerationStatus.PROOFREADING) &&
              subtitles.length > 0 && (
                <button
                  onClick={() => setShowExportModal(true)}
                  className="w-full py-2 px-3 rounded-lg font-semibold text-white text-sm shadow-lg transition-all flex items-center justify-center space-x-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-500/25 hover:shadow-emerald-500/40 animate-fade-in"
                >
                  <Download className="w-4 h-4" />
                  <span>导出字幕...</span>
                </button>
              )}

            {canShowCompression && (
              <button
                onClick={onStartCompression}
                className="w-full py-2 px-3 rounded-lg font-semibold text-white text-sm shadow-lg transition-all flex items-center justify-center space-x-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 shadow-amber-500/25 hover:shadow-amber-500/40 animate-fade-in"
              >
                <Scissors className="w-4 h-4" />
                <span>压制视频</span>
              </button>
            )}
          </div>

          {/* Export Modal */}
          <Modal
            isOpen={showExportModal}
            onClose={() => setShowExportModal(false)}
            title="导出字幕"
            icon={<Download className="w-5 h-5 mr-2 text-emerald-400" />}
            maxWidth="sm"
          >
            <p className="text-slate-400 text-sm mb-6">
              选择您需要的字幕文件格式。当前输出模式:{' '}
              {settings.outputMode === 'bilingual' ? '双语' : '仅译文'}
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  onDownload('srt');
                  setShowExportModal(false);
                }}
                className="flex flex-col items-center justify-center p-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 rounded-xl transition-all group"
              >
                <span className="text-2xl font-bold text-slate-200 group-hover:text-emerald-400 mb-1">
                  .SRT
                </span>
                <span className="text-xs text-slate-500 mt-1">通用格式</span>
              </button>
              <button
                onClick={() => {
                  onDownload('ass');
                  setShowExportModal(false);
                }}
                className="flex flex-col items-center justify-center p-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 rounded-xl transition-all group"
              >
                <span className="text-2xl font-bold text-slate-200 group-hover:text-emerald-400 mb-1">
                  .ASS
                </span>
                <span className="text-xs text-slate-500 mt-1">高级样式</span>
              </button>
            </div>

            <button
              onClick={() => setShowExportModal(false)}
              className="w-full mt-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 text-sm font-medium transition-colors"
            >
              取消
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
            <div className="bg-slate-900 border border-slate-800 rounded-xl sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl relative flex-1 min-h-0">
              {showSnapshots ? (
                <HistoryPanel
                  isOpen={showSnapshots}
                  onClose={onToggleSnapshots}
                  snapshots={snapshots}
                  onRestoreSnapshot={onRestoreSnapshot}
                  onDeleteSnapshot={onDeleteSnapshot}
                />
              ) : (
                <div className="flex-1 relative w-full h-full" ref={subtitleListRef}>
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
                    conservativeBatchMode={settings.conservativeBatchMode}
                    onToggleConservativeMode={() =>
                      onUpdateSetting('conservativeBatchMode', !settings.conservativeBatchMode)
                    }
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
