/**
 * Global Application Store (Zustand)
 *
 * Consolidates global state that was previously scattered in App.tsx.
 * This reduces props drilling and makes state accessible from any component.
 */
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { AppSettings } from '@/types/settings';
import type { ToastMessage } from '@/components/ui';
import { logger } from '@/services/utils/logger';
import { debounce } from '@/services/utils/time';

// ============================================================================
// Types
// ============================================================================

export type AppView = 'home' | 'workspace' | 'download' | 'compression' | 'endToEnd';

interface UIState {
  // Modal visibility states
  showSettings: boolean;
  showLogs: boolean;
  showGlossaryManager: boolean;
  showSpeakerManager: boolean;
  showSnapshots: boolean;
  showGenreSettings: boolean;
  settingsTab: string;
  view: AppView;
}

interface ToastState {
  toasts: ToastMessage[];
  // Timer refs are managed internally, not exposed
}

interface SettingsState {
  settings: AppSettings;
  isSettingsLoaded: boolean;
}

export interface AppState extends UIState, ToastState, SettingsState {
  // UI Actions
  setShowSettings: (show: boolean) => void;
  setShowLogs: (show: boolean) => void;
  setShowGlossaryManager: (show: boolean) => void;
  setShowSpeakerManager: (show: boolean) => void;
  setShowSnapshots: (show: boolean) => void;
  setShowGenreSettings: (show: boolean) => void;
  setSettingsTab: (tab: string) => void;
  setView: (view: AppView) => void;

  // Toast Actions
  addToast: (
    message: string,
    type?: 'info' | 'warning' | 'error' | 'success',
    duration?: number
  ) => void;
  removeToast: (id: string) => void;

  // Settings Actions
  setSettings: (settings: AppSettings) => void;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  setIsSettingsLoaded: (loaded: boolean) => void;
}

// ============================================================================
// Default Values
// ============================================================================

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
  targetLanguage: 'zh-CN',
  requestTimeout: 600,
  enableDiarization: true,
  enableSpeakerPreAnalysis: true,
  includeSpeakerInExport: false,
  useSpeakerColors: true,
  useSpeakerStyledTranslation: true,
  // Smart default: If high DPI (e.g. 200% scale), default to 80% zoom to fit more content
  zoomLevel: typeof window !== 'undefined' && window.devicePixelRatio >= 2 ? 0.8 : 1.0,
};

const SETTINGS_KEY = 'gemini_subtitle_settings';

// ============================================================================
// Toast Timer Management (internal)
// ============================================================================

const toastTimers = new Map<string, NodeJS.Timeout>();

// ============================================================================
// Store Definition
// ============================================================================

export const useAppStore = create<AppState>()(
  subscribeWithSelector((set, _get) => ({
    // ========================================================================
    // UI State
    // ========================================================================
    showSettings: false,
    showLogs: false,
    showGlossaryManager: false,
    showSpeakerManager: false,
    showSnapshots: false,
    showGenreSettings: false,
    settingsTab: 'general',
    view: 'home',

    setShowSettings: (show) => set({ showSettings: show }),
    setShowLogs: (show) => set({ showLogs: show }),
    setShowGlossaryManager: (show) => set({ showGlossaryManager: show }),
    setShowSpeakerManager: (show) => set({ showSpeakerManager: show }),
    setShowSnapshots: (show) => set({ showSnapshots: show }),
    setShowGenreSettings: (show) => set({ showGenreSettings: show }),
    setSettingsTab: (tab) => set({ settingsTab: tab }),
    setView: (view) => set({ view }),

    // ========================================================================
    // Toast State
    // ========================================================================
    toasts: [],

    addToast: (message, type = 'info', duration = 5000) => {
      const id = Date.now().toString() + Math.random().toString();
      set((state) => ({
        toasts: [...state.toasts, { id, message, type }],
      }));

      // Auto-remove after duration
      const timer = setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
        toastTimers.delete(id);
      }, duration);

      toastTimers.set(id, timer);
    },

    removeToast: (id) => {
      // Clear timer if exists
      const timer = toastTimers.get(id);
      if (timer) {
        clearTimeout(timer);
        toastTimers.delete(id);
      }
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    },

    // ========================================================================
    // Settings State
    // ========================================================================
    settings: DEFAULT_SETTINGS,
    isSettingsLoaded: false,

    setSettings: (settings) => set({ settings }),

    updateSetting: (key, value) => {
      set((state) => ({
        settings: { ...state.settings, [key]: value },
      }));
    },

    setIsSettingsLoaded: (loaded) => set({ isSettingsLoaded: loaded }),
  }))
);

// ============================================================================
// Settings Persistence Side Effects
// ============================================================================

/**
 * Initialize settings from storage (Electron or localStorage).
 * Call this once on app startup.
 */
export const initializeSettings = async (): Promise<void> => {
  const { setSettings, setIsSettingsLoaded } = useAppStore.getState();

  let storedSettings = null;

  // Try loading from Electron storage first
  if (window.electronAPI?.storage) {
    try {
      storedSettings = await window.electronAPI.storage.getSettings();
    } catch (e) {
      logger.error('Failed to load settings from Electron storage', e);
    }
  }

  // Fallback to localStorage if not in Electron or if Electron storage is empty
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
    const newSettings = { ...DEFAULT_SETTINGS, ...storedSettings };
    // Ensure glossaries array exists
    if (!newSettings.glossaries) {
      newSettings.glossaries = [];
    }
    setSettings(newSettings);
  }

  setIsSettingsLoaded(true);
};

// Subscribe to settings changes and persist
// Subscribe to settings changes and persist
// Debounce the save operation to prevent excessive I/O
const saveSettings = debounce(async (settings: AppSettings) => {
  const { isSettingsLoaded, addToast } = useAppStore.getState();
  if (!isSettingsLoaded) return;

  // Save to Electron storage
  if (window.electronAPI?.storage) {
    try {
      const result = await window.electronAPI.storage.setSettings(settings);
      // Check if save failed (new SaveResult format)
      if (result && typeof result === 'object' && 'success' in result && !result.success) {
        logger.error('Settings save failed:', result.error);
        // Show toast to user
        addToast(
          result.error || 'Failed to save settings',
          'error',
          8000 // Longer duration for important error
        );
      }
    } catch (e) {
      logger.error('Failed to save settings to Electron storage', e);
      addToast('Failed to save settings', 'error', 8000);
    }
  } else {
    // Fallback to localStorage
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      logger.error('Failed to save settings to localStorage', e);
    }
  }
}, 1000); // 1 second debounce

useAppStore.subscribe(
  (state) => state.settings,
  (settings) => {
    saveSettings(settings);
  }
);

// ============================================================================
// Zoom Level Side Effect
// ============================================================================

useAppStore.subscribe(
  (state) => state.settings.zoomLevel,
  (zoomLevel) => {
    const { isSettingsLoaded } = useAppStore.getState();
    if (!isSettingsLoaded) return;

    const zoom = zoomLevel || 1.0;

    if (window.electronAPI?.setZoomFactor) {
      window.electronAPI.setZoomFactor(zoom);
      document.documentElement.style.setProperty('--app-zoom', `${zoom}`);
    } else {
      // Web fallback
      if (zoom === 1) {
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
  }
);
