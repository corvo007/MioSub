import React, { useState, useEffect, useRef } from 'react';
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
  Users,
  Languages,
} from 'lucide-react';

import { GenerationStatus } from '@/types/api';
import { FileUploader } from '@/components/upload/FileUploader';
import { Field } from '@/components/ui/Field';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { TargetLanguageSelector } from '@/components/settings/TargetLanguageSelector';
import { Modal } from '@/components/ui/Modal';
import { NumberInput } from '@/components/ui/NumberInput';
import { formatDuration } from '@/services/subtitle/time';

import { cn } from '@/lib/cn';
import { useWorkspaceController } from '@/hooks/useWorkspaceLogic/useWorkspaceController';

interface WorkspaceSidebarProps {
  activeTab: 'new' | 'import';
  onStartCompression?: () => void;
  sidebarCollapsed: boolean;
  forceVerticalLayout: boolean;
}

export const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({
  activeTab,
  onStartCompression,
  sidebarCollapsed,
  forceVerticalLayout,
}) => {
  const { t } = useTranslation('workspace');
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Controller
  const controller = useWorkspaceController(activeTab);
  const {
    settings,
    fileState,
    subtitleState,
    generationState,
    handlers,
    isElectron,
    isProcessing,
  } = controller;

  // Deconstruct state for render usage
  const {
    genre,
    activeGlossaryId,
    glossaries,
    targetLanguage,
    outputMode,
    enableDiarization,
    minSpeakers,
    maxSpeakers,
    zoomLevel,
  } = settings;

  const { file, duration, isLoadingFile } = fileState;
  const { subtitles, subtitleFileName, isLoadingSubtitle } = subtitleState;
  const { status, error } = generationState;

  // Actions
  const {
    handleFileChange: onFileChange,
    handleFileSelectNative: onFileChangeNative,
    handleSubtitleImport: onSubtitleImport,
    handleSubtitleImportNative: onSubtitleImportNative,
    handleGenerate: onGenerate,
    handleDownload: onDownload,
  } = handlers;

  const { updateSetting, setShowGenreSettings } = controller;

  // Local State
  const [settingsExpanded, setSettingsExpanded] = useState(true);
  const [showExportModal, setShowExportModal] = useState(false);

  // Determine if compression button should show
  const canShowCompression = controller.canShowCompression(onStartCompression);

  // Auto-detect available height and collapse sections if needed
  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;

    // Small delay to let layout settle
    const timeoutId = setTimeout(() => {
      const availableHeight = sidebar.clientHeight;
      const COMPACT_HEIGHT_THRESHOLD = 600;
      const isCompact = availableHeight > 0 && availableHeight < COMPACT_HEIGHT_THRESHOLD;

      if (isCompact) {
        setSettingsExpanded(false);
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [zoomLevel, forceVerticalLayout]);

  return (
    <>
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
          className={cn('h-6 mb-1 shrink-0', !forceVerticalLayout ? 'hidden md:block' : 'hidden')}
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
                    icon={<FileText className="text-emerald-500 group-hover:text-emerald-400" />}
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

          {/* Settings Section */}
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
                    onClick={() => setShowGenreSettings(true)}
                    className="flex items-center space-x-1.5 px-2 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors group shadow-sm"
                    title={t('sidebar.editGenre')}
                  >
                    <span className="truncate max-w-25">
                      {genre === 'general'
                        ? t('genres.general')
                        : genre === 'anime'
                          ? t('genres.anime')
                          : genre === 'movie'
                            ? t('genres.movie')
                            : genre === 'news'
                              ? t('genres.news')
                              : genre === 'tech'
                                ? t('genres.tech')
                                : genre}
                    </span>
                    <Edit2 className="w-3 h-3 text-slate-400 group-hover:text-brand-purple transition-colors" />
                  </button>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <Field
                    label={
                      <span className="flex items-center">
                        <Book className="w-3 h-3 mr-2" /> {t('sidebar.glossary')}
                      </span>
                    }
                    labelClassName="text-slate-500 text-xs mb-1"
                  >
                    <CustomSelect
                      value={activeGlossaryId || ''}
                      onChange={(val) => updateSetting('activeGlossaryId', val || null)}
                      options={[
                        { value: '', label: t('sidebar.noGlossary') },
                        ...(glossaries?.map((g) => ({
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
                  </Field>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <Field
                    label={
                      <span className="flex items-center">
                        <Languages className="w-3 h-3 mr-2" /> {t('sidebar.targetLanguage')}
                      </span>
                    }
                    labelClassName="text-slate-500 text-xs mb-1"
                  >
                    <TargetLanguageSelector
                      value={targetLanguage}
                      onChange={(val) => updateSetting('targetLanguage', val)}
                      variant="inline"
                      className="w-full"
                    />
                  </Field>
                </div>

                {activeTab === 'new' && enableDiarization && (
                  <div className="flex flex-col space-y-1.5 pt-2 border-t border-slate-100">
                    <span className="text-slate-500 text-xs flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      {t('sidebar.speakerCount')}
                    </span>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">{t('sidebar.speakerMin')}</span>
                        <NumberInput
                          value={minSpeakers}
                          onChange={(num) => updateSetting('minSpeakers', num)}
                          min={1}
                          max={99}
                          placeholder="-"
                          className="w-12 px-1.5 py-1 text-xs text-center"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">{t('sidebar.speakerMax')}</span>
                        <NumberInput
                          value={maxSpeakers}
                          onChange={(num) => updateSetting('maxSpeakers', num)}
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
            <span className="w-full line-clamp-3 break-all" title={error}>
              {error}
            </span>
          </div>
        )}

        {(status === GenerationStatus.COMPLETED || status === GenerationStatus.CANCELLED) &&
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
          {outputMode === 'bilingual' ? t('export.bilingual') : t('export.translationOnly')}
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
    </>
  );
};
