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
  requestTimeout: 600,
};

/**
 * Custom hook for managing application settings
 * Handles localStorage persistence and legacy data migration
 */
export const useSettings = () => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);

  // Initialize: Load from storage (Electron or localStorage)
  useEffect(() => {
    const loadSettings = async () => {
      let storedSettings = null;

      // Try loading from Electron storage first
      if (window.electronAPI?.storage) {
        try {
          storedSettings = await window.electronAPI.storage.getSettings();
        } catch (e) {
          logger.error('Failed to load settings from Electron storage', e);
        }
      }

      // Fallback to localStorage if not in Electron or if Electron storage is empty (first run)
      // Note: We might want to migrate localStorage to Electron storage here if needed
      if (!storedSettings) {
        const localData = localStorage.getItem(SETTINGS_KEY);
        if (localData) {
          try {
            storedSettings = JSON.parse(localData);
          } catch (e) {
            logger.warn('LocalStorage parse error', e);
          }
        }
      }

      if (storedSettings) {
        try {
          // If storedSettings came from Electron, it's already an object.
          // If from localStorage, we parsed it.
          // However, we should ensure we are merging with DEFAULT_SETTINGS correctly.

          let newSettings = { ...DEFAULT_SETTINGS, ...storedSettings };

          // Migration: Legacy glossary to Multi-Glossary
          if (
            storedSettings.glossary &&
            storedSettings.glossary.length > 0 &&
            (!storedSettings.glossaries || storedSettings.glossaries.length === 0)
          ) {
            const defaultGlossary = migrateFromLegacyGlossary(storedSettings.glossary);
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
              terms: g.terms || g.items || [],
            }));
          }

          setSettings(newSettings);
        } catch (e) {
          logger.warn('Settings load error', e);
        }
      }
      setIsSettingsLoaded(true);
    };

    loadSettings();
  }, []);

  // Auto-save: Persist to storage when settings change
  useEffect(() => {
    if (!isSettingsLoaded) return;

    // Save to Electron storage
    if (window.electronAPI?.storage) {
      window.electronAPI.storage.setSettings(settings).catch((e) => {
        logger.error('Failed to save settings to Electron storage', e);
      });
    }

    // Always save to localStorage as backup/sync for now (or remove if we want strict separation)
    // User requested "no longer use localStorage", so we should probably ONLY use Electron storage if available.
    if (!window.electronAPI?.storage) {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }
  }, [settings, isSettingsLoaded]);

  /**
   * Update a single setting
   */
  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return {
    settings,
    isSettingsLoaded,
    updateSetting,
  };
};
