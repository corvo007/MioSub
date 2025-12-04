import React, { useState, useEffect } from 'react';
import { GenerationStatus } from '@/types/api';
import { logger, LogEntry } from '@/services/utils/logger';

import { GlossaryManager } from '@/components/glossary/GlossaryManager';
import { SettingsModal, GenreSettingsDialog } from '@/components/settings';
import { GlossaryExtractionFailedDialog, GlossaryConfirmationModal, SimpleConfirmationModal } from '@/components/modals';
import { ToastContainer, ProgressOverlay } from '@/components/ui';

// Custom Hooks
import { useSettings, useToast, useSnapshots, useGlossaryFlow, useWorkspaceLogic } from '@/hooks';

// Page Components
import { LogViewerModal } from '@/components/layout/LogViewerModal';
import { HomePage } from '@/components/pages/HomePage';
import { WorkspacePage } from '@/components/pages/WorkspacePage';

import { getEnvVariable } from "@/services/utils/env";

const ENV_GEMINI_KEY = getEnvVariable('GEMINI_API_KEY') || '';
const ENV_OPENAI_KEY = getEnvVariable('OPENAI_API_KEY') || '';

export default function App() {
    // View State
    const [view, setView] = useState<'home' | 'workspace'>('home');
    const [activeTab, setActiveTab] = useState<'new' | 'import'>('new');
    const [settingsTab, setSettingsTab] = useState('general');

    const [showSnapshots, setShowSnapshots] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showGenreSettings, setShowGenreSettings] = useState(false);
    const [showGlossaryManager, setShowGlossaryManager] = useState(false);

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

        if (window.electronAPI && window.electronAPI.onNewLog) {
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
        const doGoBack = () => {
            setView('home');
            workspace.resetWorkspace();
        };

        if (workspace.subtitles.length > 0) {
            showConfirm(
                "返回主页",
                "返回主页？未保存的进度将丢失。",
                doGoBack,
                'warning'
            );
        } else {
            doGoBack();
        }
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
                        workspace.resetWorkspace();
                    }}
                    onStartImport={() => {
                        setActiveTab('import');
                        setView('workspace');
                        workspace.resetWorkspace();
                    }}
                    onShowLogs={() => setShowLogs(true)}
                    onShowGlossary={() => setShowGlossaryManager(true)}
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
            <SimpleConfirmationModal
                isOpen={confirmation.isOpen}
                onClose={() => setConfirmation(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmation.onConfirm}
                title={confirmation.title}
                message={confirmation.message}
                type={confirmation.type}
            />
        </>
    );
}
