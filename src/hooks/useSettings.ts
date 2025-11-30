import { useState, useEffect } from 'react';
import { AppSettings } from '@/types/settings';
import { migrateFromLegacyGlossary } from '@/services/glossary/migrator';
import { logger } from '@/services/utils/logger';

const SETTINGS_KEY = 'gemini_subtitle_settings';

const DEFAULT_SETTINGS: AppSettings = {
    geminiKey: '',
    openaiKey: '',
    transcriptionModel: 'whisper-1',
    genre: 'general',
    customTranslationPrompt: '',
    customProofreadingPrompt: '',
    outputMode: 'bilingual',
    proofreadBatchSize: 20,
    translationBatchSize: 20,
    chunkDuration: 300,
    concurrencyFlash: 5,
    concurrencyPro: 2,
    enableAutoGlossary: true,
    glossarySampleMinutes: 'all',
    glossaryAutoConfirm: false,
    useSmartSplit: true,
    glossaries: [],
    activeGlossaryId: null,
    requestTimeout: 600
};

/**
 * Custom hook for managing application settings
 * Handles localStorage persistence and legacy data migration
 */
export const useSettings = () => {
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);

    // Initialize: Load from localStorage
    useEffect(() => {
        const storedSettings = localStorage.getItem(SETTINGS_KEY);
        if (storedSettings) {
            try {
                const parsed = JSON.parse(storedSettings);
                let newSettings = { ...DEFAULT_SETTINGS, ...parsed };

                // Migration: Legacy glossary to Multi-Glossary
                if (parsed.glossary && parsed.glossary.length > 0 && (!parsed.glossaries || parsed.glossaries.length === 0)) {
                    const defaultGlossary = migrateFromLegacyGlossary(parsed.glossary);
                    newSettings.glossaries = [defaultGlossary];
                    newSettings.activeGlossaryId = defaultGlossary.id;
                    logger.info('Migrated legacy glossary to new format');
                }

                // Ensure glossaries array exists and fix malformed data
                if (!newSettings.glossaries) {
                    newSettings.glossaries = [];
                } else {
                    // Fix potential migration issues (items vs terms)
                    newSettings.glossaries = newSettings.glossaries.map((g: any) => ({
                        ...g,
                        terms: g.terms || g.items || []
                    }));
                }

                setSettings(newSettings);
            } catch (e) {
                logger.warn("Settings load error", e);
            }
        }
        setIsSettingsLoaded(true);
    }, []);

    // Auto-save: Persist to localStorage when settings change
    useEffect(() => {
        if (!isSettingsLoaded) return;
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }, [settings, isSettingsLoaded]);

    /**
     * Update a single setting
     */
    const updateSetting = <K extends keyof AppSettings>(
        key: K,
        value: AppSettings[K]
    ) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    return {
        settings,
        isSettingsLoaded,
        updateSetting
    };
};
