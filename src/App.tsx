import React, { useState, useEffect } from 'react';
import { GenerationStatus } from '@/types/api';
import { logger, LogEntry } from '@/services/utils/logger';

import { GlossaryManager } from '@/components/glossary/GlossaryManager';
import { SettingsModal, GenreSettingsDialog } from '@/components/settings';
import { GlossaryExtractionFailedDialog, GlossaryConfirmationModal, SimpleConfirmationModal, SpeakerManagerModal, AboutModal } from '@/components/modals';
import { ToastContainer, ProgressOverlay } from '@/components/ui';

// Custom Hooks
import { useSettings, useToast, useSnapshots, useGlossaryFlow, useWorkspaceLogic } from '@/hooks';

// Page Components
import { LogViewerModal } from '@/components/layout/LogViewerModal';
import { HomePage } from '@/components/pages/HomePage';
import { WorkspacePage } from '@/components/pages/WorkspacePage';
import { DownloadPage } from '@/components/download';
import { CompressionPage } from '@/components/compression/CompressionPage';

import { getEnvVariable } from "@/services/utils/env";

const ENV_GEMINI_KEY = getEnvVariable('GEMINI_API_KEY') || '';
const ENV_OPENAI_KEY = getEnvVariable('OPENAI_API_KEY') || '';

export default function App() {
    // View State
    const [view, setView] = useState<'home' | 'workspace' | 'download' | 'compression'>('home');
    const [activeTab, setActiveTab] = useState<'new' | 'import'>('new');
    const [settingsTab, setSettingsTab] = useState('general');

    const [showSnapshots, setShowSnapshots] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showGenreSettings, setShowGenreSettings] = useState(false);
    const [showGlossaryManager, setShowGlossaryManager] = useState(false);
    const [showSpeakerManager, setShowSpeakerManager] = useState(false);
    const [showAbout, setShowAbout] = useState(false);

    // Downloaded video path - for passing to compression page
    const [downloadedVideoPath, setDownloadedVideoPath] = useState<string | null>(null);

    // Custom Hooks
    const { settings, isSettingsLoaded, updateSetting } = useSettings();
    const { toasts, addToast, removeToast } = useToast();
    const snapshotsValues = useSnapshots();
    const glossaryFlow = useGlossaryFlow();

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
        onConfirm: () => { },
        type: 'warning'
    });

    const showConfirm = (title: string, message: string, onConfirm: () => void, type: 'info' | 'warning' | 'danger' = 'warning') => {
        setConfirmation({ isOpen: true, title, message, onConfirm, type });
    };

    // Workspace Logic
    const workspace = useWorkspaceLogic({
        settings,
        updateSetting,
        addToast,
        showConfirm,
        glossaryFlow,
        snapshotsValues,
        setShowSettings
    });

    // Logs State
    const [showLogs, setShowLogs] = useState(false);
    const [logs, setLogs] = useState<LogEntry[]>([]);

    // Import log parser
    // Note: We need to import this at the top, but for this replace block we'll assume it's available or add import separately if needed.
    // Since I can't easily add import at top with this block, I will add a separate replace for imports.

    // IPC Listeners
    useEffect(() => {
        let unsubscribeAbout: (() => void) | undefined;
        if (window.electronAPI?.onShowAbout) {
            unsubscribeAbout = window.electronAPI.onShowAbout(() => {
                setShowAbout(true);
            });
        }
        return () => {
            if (unsubscribeAbout) unsubscribeAbout();
        };
    }, []);

    useEffect(() => {
        // Initial load of frontend logs
        setLogs(logger.getLogs());

        // Subscribe to new frontend logs
        const unsubscribe = logger.subscribe((log) => {
            setLogs(prev => [...prev, log]);

            // Auto-toast for errors
            if (log.level === 'ERROR') {
                addToast(log.message, 'error', 5000);
            }
        });

        return () => {
            unsubscribe();
        };
    }, []);

    // Backend logs handling - Global subscription
    useEffect(() => {
        let unsubscribeBackend: (() => void) | undefined;

        const initBackendLogs = async () => {
            if (window.electronAPI && window.electronAPI.getMainLogs) {
                try {
                    const historyLogs = await window.electronAPI.getMainLogs();
                    console.log(`[App] Loaded ${historyLogs.length} historical logs from backend`);

                    const { parseBackendLog } = await import('@/services/utils/logParser');

                    const parsedHistory = historyLogs.map(logLine => {
                        try {
                            return parseBackendLog(logLine);
                        } catch (e) {
                            return null;
                        }
                    }).filter(l => l !== null) as LogEntry[];

                    setLogs(prev => {
                        // Merge avoiding duplicates
                        const newLogs = [...prev];
                        parsedHistory.forEach(pl => {
                            if (!newLogs.some(existing => existing.data?.raw === pl.data?.raw)) {
                                newLogs.push(pl);
                            }
                        });
                        return newLogs.sort((a, b) => {
                            // Simple sort if timestamp string comparison works (it usually does for ISO-like), 
                            // but our timestamp is HH:MM:SS which might wrap days. 
                            // Ideally backend sends ISO. But for now preserving order is enough.
                            return 0;
                        });
                    });
                } catch (err) {
                    console.error("Failed to load backend log history:", err);
                }
            }
        };

        if (window.electronAPI && window.electronAPI.onNewLog) {
            // Initialize history first
            initBackendLogs();

            unsubscribeBackend = window.electronAPI.onNewLog(async (logLine) => {
                // Print to DevTools console for visibility
                console.log(`[Main] ${logLine}`);

                try {
                    const { parseBackendLog } = await import('@/services/utils/logParser');
                    const parsed = parseBackendLog(logLine);
                    setLogs(prev => {
                        if (prev.some(l => l.data?.raw === logLine)) return prev;
                        return [...prev, parsed];
                    });
                } catch (err) {
                    console.error("Error parsing real-time log:", err);
                }
            });
        }

        return () => {
            if (unsubscribeBackend) unsubscribeBackend();
        };
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
                settings={settings}
                onRetry={workspace.handleRetryGlossary}
                onContinue={() => {
                    glossaryFlow.setShowGlossaryFailure(false);
                    if (glossaryFlow.glossaryConfirmCallback) {
                        glossaryFlow.glossaryConfirmCallback(settings.glossary || []);
                        glossaryFlow.setGlossaryConfirmCallback(null);
                    }
                }}
            />
            <SettingsModal
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
                activeTab={settingsTab}
                setActiveTab={setSettingsTab}
                settings={settings}
                updateSetting={updateSetting}
                envGeminiKey={ENV_GEMINI_KEY}
                envOpenaiKey={ENV_OPENAI_KEY}
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
            <LogViewerModal
                isOpen={showLogs}
                logs={logs}
                onClose={() => setShowLogs(false)}
            />
            {view === 'home' && (
                <HomePage
                    onStartNew={() => {
                        setActiveTab('new');
                        setView('workspace');
                        // Preserve existing workspace state
                    }}
                    onStartImport={() => {
                        setActiveTab('import');
                        setView('workspace');
                        // Preserve existing workspace state
                    }}
                    onStartDownload={() => setView('download')}
                    onShowLogs={() => setShowLogs(true)}
                    onShowGlossary={() => setShowGlossaryManager(true)}
                    onShowSettings={() => setShowSettings(true)}
                    onStartCompression={() => setView('compression')}
                />
            )}
            {view === 'download' && (
                <DownloadPage
                    onGoBack={() => setView('home')}
                    onShowLogs={() => setShowLogs(true)}
                    onShowSettings={() => setShowSettings(true)}
                    onDownloadComplete={(videoPath) => {
                        // Save the downloaded video path for later use (e.g., compression)
                        setDownloadedVideoPath(videoPath);
                        // Switch to workspace and set the downloaded video
                        setActiveTab('new');
                        setView('workspace');
                        workspace.resetWorkspace();
                        // Load the downloaded video
                        workspace.loadFileFromPath(videoPath);
                    }}
                />
            )}
            {view === 'compression' && (
                <CompressionPage
                    onGoBack={() => setView('home')}
                    workspaceSubtitles={workspace.subtitles}
                    workspaceVideoFile={workspace.file}
                    downloadedVideoPath={downloadedVideoPath}
                    onShowLogs={() => setShowLogs(true)}
                    onShowSettings={() => setShowSettings(true)}
                />
            )}
            {view === 'workspace' && (
                <WorkspacePage
                    activeTab={activeTab}
                    file={workspace.file}
                    duration={workspace.duration}
                    subtitles={workspace.subtitles}
                    status={workspace.status}
                    error={workspace.error}
                    settings={settings}
                    snapshots={snapshotsValues.snapshots}
                    showSnapshots={showSnapshots}
                    selectedBatches={workspace.selectedBatches}
                    batchComments={workspace.batchComments}
                    showSourceText={workspace.showSourceText}
                    editingCommentId={workspace.editingCommentId}
                    onFileChange={(e) => workspace.handleFileChange(e, activeTab)}
                    onFileChangeNative={workspace.handleFileSelectNative}
                    onSubtitleImport={workspace.handleSubtitleImport}
                    onGenerate={workspace.handleGenerate}
                    onDownload={workspace.handleDownload}
                    onGoBack={goBackHome}
                    onShowLogs={() => setShowLogs(true)}
                    onShowGlossary={() => setShowGlossaryManager(true)}
                    onShowSettings={() => setShowSettings(true)}
                    onShowGenreSettings={() => setShowGenreSettings(true)}
                    onUpdateSetting={updateSetting}
                    onToggleSnapshots={() => setShowSnapshots(!showSnapshots)}
                    onRestoreSnapshot={(snap) => {
                        showConfirm(
                            "恢复快照",
                            `确定要恢复到 ${snap.timestamp} 的版本吗？当前未保存的进度将丢失。`,
                            () => {
                                workspace.setSubtitles(JSON.parse(JSON.stringify(snap.subtitles)));
                                workspace.setBatchComments({ ...snap.batchComments });
                                setShowSnapshots(false);
                            },
                            'warning'
                        );
                    }}
                    toggleAllBatches={workspace.toggleAllBatches}
                    selectBatchesWithComments={workspace.selectBatchesWithComments}
                    setShowSourceText={workspace.setShowSourceText}
                    handleBatchAction={workspace.handleBatchAction}
                    toggleBatch={workspace.toggleBatch}
                    updateBatchComment={workspace.updateBatchComment}
                    setEditingCommentId={workspace.setEditingCommentId}
                    updateLineComment={workspace.updateLineComment}
                    updateSubtitleText={workspace.updateSubtitleText}
                    updateSubtitleOriginal={workspace.updateSubtitleOriginal}
                    updateSpeaker={workspace.updateSpeaker}
                    updateSubtitleTime={workspace.updateSubtitleTime}
                    speakerProfiles={workspace.speakerProfiles}
                    deleteSubtitle={workspace.deleteSubtitle}
                    deleteMultipleSubtitles={workspace.deleteMultipleSubtitles}
                    onManageSpeakers={() => setShowSpeakerManager(true)}
                    onStartCompression={() => setView('compression')}
                    histories={workspace.getHistories()}
                    onLoadHistory={workspace.loadHistory}
                    onDeleteHistory={workspace.deleteHistory}
                />
            )}
            <GenreSettingsDialog
                isOpen={showGenreSettings}
                onClose={() => setShowGenreSettings(false)}
                currentGenre={settings.genre}
                onSave={(genre) => updateSetting('genre', genre)}
            />
            <ProgressOverlay
                isProcessing={workspace.status === GenerationStatus.UPLOADING || workspace.status === GenerationStatus.PROCESSING || workspace.status === GenerationStatus.PROOFREADING}
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
                speakerCounts={workspace.subtitles.reduce((acc, sub) => {
                    if (sub.speaker) {
                        acc[sub.speaker] = (acc[sub.speaker] || 0) + 1;
                    }
                    return acc;
                }, {} as Record<string, number>)}
                onRename={workspace.renameSpeaker}
                onDelete={workspace.deleteSpeaker}
                onMerge={workspace.mergeSpeakers}
                onCreate={workspace.addSpeaker}
            />
            <SimpleConfirmationModal
                isOpen={confirmation.isOpen}
                onClose={() => setConfirmation(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmation.onConfirm}
                title={confirmation.title}
                message={confirmation.message}
                type={confirmation.type}
            />
            <AboutModal
                isOpen={showAbout}
                onClose={() => setShowAbout(false)}
            />
        </>
    );
}
