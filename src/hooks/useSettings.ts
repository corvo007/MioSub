import { useState, useEffect } from 'react';
import { type AppSettings } from '@/types/settings';
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
  enableDiarization: true,
  enableSpeakerPreAnalysis: true,
  includeSpeakerInExport: false,
  useSpeakerColors: true,
  useSpeakerStyledTranslation: true,
  // Smart default: If high DPI (e.g. 200% scale), default to 80% zoom to fit more content
  zoomLevel: typeof window !== 'undefined' && window.devicePixelRatio >= 2 ? 0.8 : 1.0,
};

/**
 * Custom hook for managing application settings
 * Handles localStorage persistence and legacy data migration
 */
export const useSettings = () => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);

  // Effect: Apply Zoom Level
  useEffect(() => {
    if (!isSettingsLoaded) return;

    // Default to 1.0 if undefined
    const zoom = settings.zoomLevel || 1.0;

    if (window.electronAPI?.setZoomFactor) {
      window.electronAPI.setZoomFactor(zoom);
      // 同时设置 CSS 变量，确保组件可统一从 CSS 读取 zoom 值
      document.documentElement.style.setProperty('--app-zoom', `${zoom}`);
    } else {
      // Web fallback: Use CSS Variable for transform scaling
      if (zoom === 1) {
        // Reset to default (none) to avoid stacking context issues
        document.documentElement.style.removeProperty('--app-transform');
        document.documentElement.style.removeProperty('--app-width');
        document.documentElement.style.removeProperty('--app-height');
        document.documentElement.style.removeProperty('--app-height-safe');
        document.documentElement.style.removeProperty('--app-zoom');
      } else {
        document.documentElement.style.setProperty('--app-transform', `scale(${zoom})`);
        document.documentElement.style.setProperty('--app-width', `calc(100% / ${zoom})`);
        document.documentElement.style.setProperty('--app-height', `calc(100% / ${zoom})`);
        document.documentElement.style.setProperty('--app-height-safe', `calc(100dvh / ${zoom})`);
        document.documentElement.style.setProperty('--app-zoom', `${zoom}`);
      }
    }
    logger.info(`Applied zoom factor: ${zoom}`);
  }, [settings.zoomLevel, isSettingsLoaded]);

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

          // Ensure glossaries array exists
          if (!newSettings.glossaries) {
            newSettings.glossaries = [];
          }

          setSettings(newSettings);
        } catch (e) {
          logger.warn('Settings load error', e);
        }
      }
      setIsSettingsLoaded(true);
    };

    void loadSettings();
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
