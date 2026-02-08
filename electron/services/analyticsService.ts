import * as Amplitude from '@amplitude/analytics-node';
import Mixpanel from 'mixpanel';
import * as Sentry from '@sentry/electron/main';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import os from 'os';
import { storageService } from './storage.ts';
import { isPortableMode } from '../utils/paths.ts';
import { systemInfoService } from './systemInfoService.ts';

const ANALYTICS_FILE = 'gemini-subtitle-pro-analytics.json';

interface AnalyticsStore {
  userId: string;
  firstLaunchAt: string;
}

class AnalyticsService {
  private amplitudeInitialized = false;
  private mixpanel: Mixpanel.Mixpanel | null = null;
  private userId: string | null = null;
  private sessionId: number = Date.now(); // Generate session ID on service creation (App Launch)
  private isDev = !app.isPackaged;

  private appVersion: string = 'unknown';
  private firstLaunchAt: string | null = null;
  private cachedAppLanguage: string = 'auto';
  private cachedHardwareInfo: Record<string, any> | null = null;
  private profileSet = false;
  private recentEvents: Map<string, number> = new Map(); // For debounce: eventKey -> timestamp
  private readonly DEBOUNCE_MS = 1000; // 1 second debounce window

  constructor() {}

  async initialize(appVersion?: string) {
    // 0. Set App Version
    this.appVersion = appVersion || app.getVersion();

    // 1. Load or Generate User ID
    await this.loadIdentity();

    // 1.5. Sync User ID to Sentry for cross-referencing with analytics
    if (this.userId) {
      Sentry.setUser({ id: this.userId });
    }

    // 2. Get App ID from Env
    const amplitudeApiKey = process.env.VITE_AMPLITUDE_API_KEY;
    const mixpanelToken = process.env.VITE_MIXPANEL_TOKEN;

    if (this.isDev) {
      console.log('[Analytics] Loaded Amplitude Key:', amplitudeApiKey ? 'Yes' : 'No');
      console.log('[Analytics] Loaded Mixpanel Token:', mixpanelToken ? 'Yes' : 'No');
    }

    if (!amplitudeApiKey && !mixpanelToken) {
      if (this.isDev) {
        console.warn('[Analytics] Both Analytics Keys are missing. Analytics disabled (Dev mode).');
      }
      return;
    }

    if (!this.userId) return; // Should not happen

    try {
      if (amplitudeApiKey) {
        Amplitude.init(amplitudeApiKey, {
          logLevel: this.isDev ? Amplitude.Types.LogLevel.Warn : Amplitude.Types.LogLevel.None,
        });
        this.amplitudeInitialized = true;
      }

      if (mixpanelToken) {
        this.mixpanel = Mixpanel.init(mixpanelToken);
      }

      if (this.isDev) {
        console.log(
          `[Analytics] Initialized. User: ${this.userId.substring(0, 8)}... (${this.isDev ? 'Test Mode' : 'Prod'})`
        );
      }

      // Load initial settings for caching
      let cachedZoomLevel: number | undefined;
      try {
        const settings = await storageService.readSettings();
        if (settings?.language) {
          this.cachedAppLanguage = settings.language;
        }
        cachedZoomLevel = settings?.zoomLevel;
      } catch (e) {
        console.error('[Analytics] Failed to load initial settings:', e);
      }

      // Collect Binary Info for Sentry context and analytics
      const systemInfo = await systemInfoService.getInfo();

      // Set Sentry Context with binary versions
      Sentry.setContext('binaries', systemInfoService.getForSentry(systemInfo));

      // Track App Launch
      // Collect Full Device Info (including Hardware)
      const deviceInfo = await this.getDeviceInfo();

      // Set Amplitude User Properties
      // This is required for the "Users" dashboard to populate Language, OS, etc.
      if (this.amplitudeInitialized && this.userId) {
        const identifyEvent = new Amplitude.Identify();
        identifyEvent.set('language', deviceInfo.system_language);
        identifyEvent.set('os', deviceInfo.os_name);
        identifyEvent.set('os_version', deviceInfo.os_version);
        identifyEvent.set('platform', deviceInfo.platform);
        identifyEvent.set('device', deviceInfo.device_model);
        identifyEvent.set('app_language', deviceInfo.app_language);
        identifyEvent.set('timezone', deviceInfo.time_zone);
        if (this.firstLaunchAt) {
          identifyEvent.setOnce('first_seen', this.firstLaunchAt);
        }
        Amplitude.identify(identifyEvent, { user_id: this.userId });
      }

      // Set Mixpanel User Profile
      // This is required for the "Users" dashboard to populate
      // Use $os, $browser, $device for Mixpanel reserved fields
      if (this.mixpanel && this.userId) {
        const osName = deviceInfo.os_name;
        this.mixpanel.people.set(this.userId, {
          $name: `User ${this.userId.substring(0, 6)}`,
          $created: this.firstLaunchAt || new Date().toISOString(),
          $os: osName,
          $os_version: deviceInfo.os_version,
          $device: deviceInfo.device_model,
          ...deviceInfo,
        });
        this.profileSet = true;
      }

      await this.track(
        'app_launched',
        {
          ...deviceInfo,
          ...systemInfoService.getForAnalytics(systemInfo),
          zoom_level: cachedZoomLevel,
        },
        'system'
      );
    } catch (error) {
      if (this.isDev) {
        console.error('[Analytics] Failed to initialize:', error);
      }
    }
  }

  private async loadIdentity() {
    try {
      // Use standard AppData (userData) for analytics ID to ensure persistence across updates/uninstalls
      // Do NOT use getStorageDir() which might be portable/local
      const storageDir = app.getPath('userData');
      const filePath = path.join(storageDir, ANALYTICS_FILE);

      if (fs.existsSync(filePath)) {
        const data = JSON.parse(await fs.promises.readFile(filePath, 'utf-8')) as AnalyticsStore;
        if (data.userId) {
          this.userId = data.userId;
          this.firstLaunchAt = data.firstLaunchAt || null;
          return;
        }
      }

      // Generate new Identity
      this.userId = crypto.randomUUID();
      this.firstLaunchAt = new Date().toISOString();
      const newData: AnalyticsStore = {
        userId: this.userId,
        firstLaunchAt: this.firstLaunchAt,
      };

      if (!fs.existsSync(storageDir)) {
        await fs.promises.mkdir(storageDir, { recursive: true });
      }

      await fs.promises.writeFile(filePath, JSON.stringify(newData, null, 2), 'utf-8');
      if (this.isDev) {
        console.log('[Analytics] Generated new anonymous identity.');
      }
    } catch (error) {
      if (this.isDev) {
        console.error('[Analytics] Identity storage failure:', error);
      }
      // Fallback in memory
      this.userId = crypto.randomUUID();
    }
  }

  async track(
    signalType: string,
    payload: Record<string, any> = {},
    eventType: 'page_view' | 'interaction' | 'system' = 'interaction'
  ) {
    if (!this.amplitudeInitialized && !this.mixpanel) return;

    // Debounce: Skip duplicate events within 1 second
    const eventKey = `${signalType}:${JSON.stringify(payload)}`;
    const now = Date.now();
    const lastSent = this.recentEvents.get(eventKey);
    if (lastSent && now - lastSent < this.DEBOUNCE_MS) {
      if (this.isDev) {
        console.log(`[Analytics] Debounced duplicate event: ${signalType}`);
      }
      return;
    }
    this.recentEvents.set(eventKey, now);

    // Clean up old entries (older than 10 seconds) to prevent memory leak
    for (const [key, timestamp] of this.recentEvents) {
      if (now - timestamp > 10000) {
        this.recentEvents.delete(key);
      }
    }

    try {
      // Add common metadata if not present
      const finalPayload = {
        ...payload,
        event_type: eventType,
        app_version: this.appVersion,
      };

      if (this.userId) {
        const deviceInfo = await this.getDeviceInfo();

        // Fallback: set user profile if trackAppLaunch() failed before people.set
        if (!this.profileSet && this.mixpanel) {
          this.mixpanel.people.set(this.userId, {
            $name: `User ${this.userId.substring(0, 6)}`,
            $created: this.firstLaunchAt || new Date().toISOString(),
            $os: deviceInfo.os_name,
            $os_version: deviceInfo.os_version,
            $device: deviceInfo.device_model,
            ...deviceInfo,
          });
          this.profileSet = true;
        }

        // Unified event data for both platforms
        const eventData = {
          ...finalPayload,
          ...deviceInfo,
          session_id: this.sessionId,
        };

        if (this.amplitudeInitialized) {
          Amplitude.track(signalType, eventData, {
            user_id: this.userId,
            session_id: this.sessionId,
            time: Date.now(), // Timestamp in milliseconds for accurate timezone
            os_name: deviceInfo.os_name, // Predefined field for OS column
            os_version: deviceInfo.os_version, // Predefined field for OS Version
            ip: '$remote',
            insert_id: crypto.randomUUID(), // Unique ID for event deduplication
          });
        }

        if (this.mixpanel) {
          this.mixpanel.track(signalType, {
            distinct_id: this.userId,
            time: Math.floor(Date.now() / 1000), // Unix timestamp in seconds for accurate timezone
            $os: deviceInfo.os_name, // Reserved property for Operating System column
            $os_version: deviceInfo.os_version, // OS Version
            $browser: 'Electron', // Reserved property for Browser column
            session_id: this.sessionId, // Session tracking
            $insert_id: crypto.randomUUID(), // Unique ID for event deduplication
            // Note: ip is omitted to let Mixpanel auto-resolve City/Country from IP
            ...eventData,
          });
        }
      }

      if (this.isDev) {
        console.log(`[Analytics] Signal sent: ${signalType}`, finalPayload);
      }
    } catch (error) {
      if (this.isDev) {
        console.error(`[Analytics] Failed to send signal ${signalType}:`, error);
      }
    }
  }

  private async getDeviceInfo() {
    // 1. Get Hardware Info (Cached)
    if (!this.cachedHardwareInfo) {
      try {
        const cpus = os.cpus();
        const cpuModel = cpus.length > 0 ? cpus[0].model : 'unknown';
        const memoryGb = Math.round(os.totalmem() / (1024 * 1024 * 1024));

        let gpuModels = 'unknown';
        try {
          const gpuInfo = (await app.getGPUInfo('basic')) as any;
          if (gpuInfo?.gpuDevice && Array.isArray(gpuInfo.gpuDevice)) {
            const models = gpuInfo.gpuDevice
              .map((g: any) => {
                const vendor = g.vendorString || `Vendor ${g.vendorId}`;
                const device = g.deviceString || g.driverVendor || `Device ${g.deviceId}`;
                return `${vendor} ${device}`.trim();
              })
              .filter((model: string) => {
                const ignored = [
                  'Microsoft Basic Render Driver',
                  'Microsoft Remote Display Adapter',
                  'Google SwiftShader',
                  'llvmpipe',
                  'Software Rasterizer',
                ];
                return !ignored.some((i) => model.includes(i));
              });

            gpuModels = Array.from(new Set(models)).join('; ');
          }
        } catch (_e) {
          // GPU info fetching failed
        }

        this.cachedHardwareInfo = {
          cpu_model: cpuModel,
          memory_gb: memoryGb,
          gpu_models: gpuModels,
        };
      } catch (_error) {
        this.cachedHardwareInfo = {};
      }
    }

    const platformMap: Record<string, string> = {
      win32: 'Windows',
      darwin: 'macOS',
      linux: 'Linux',
      aix: 'AIX',
      freebsd: 'FreeBSD',
      openbsd: 'OpenBSD',
      sunos: 'SunOS',
    };

    return {
      // Hardware
      ...this.cachedHardwareInfo,

      // OS / Platform
      os_name: platformMap[process.platform] || process.platform,
      os_version: process.getSystemVersion(),
      platform: platformMap[process.platform] || process.platform,
      arch: process.arch, // Added arch here as it was used in initialize

      // App / Locale / Timezone
      device_model: 'Desktop',
      system_language: app.getLocale(),
      app_language: this.cachedAppLanguage,
      time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      app_mode: !app.isPackaged ? 'development' : isPortableMode() ? 'portable' : 'installed',
    };
  }

  setAppLanguage(lang: string) {
    if (lang === this.cachedAppLanguage) return;
    this.cachedAppLanguage = lang;

    // Re-send user properties so analytics platforms get the resolved language
    // instead of the initial 'auto' default
    if (this.amplitudeInitialized && this.userId) {
      const identifyEvent = new Amplitude.Identify();
      identifyEvent.set('app_language', lang);
      Amplitude.identify(identifyEvent, { user_id: this.userId });
    }
    if (this.mixpanel && this.userId) {
      this.mixpanel.people.set(this.userId, { app_language: lang });
    }
  }

  /**
   * Gracefully shutdown analytics - track app_closed and flush all pending events.
   * Should be called on app quit to ensure all events are sent.
   */
  async shutdown() {
    // Track app closed event
    await this.track('app_closed', {}, 'system');

    // Flush both platforms to ensure events are sent
    const flushPromises: Promise<void>[] = [];

    if (this.amplitudeInitialized) {
      flushPromises.push(
        Amplitude.flush()
          .promise.then(() => {
            if (this.isDev) {
              console.log('[Analytics] Amplitude events flushed.');
            }
          })
          .catch((e) => {
            if (this.isDev) {
              console.error('[Analytics] Amplitude flush failed:', e);
            }
          })
      );
    }

    // Mixpanel Node SDK doesn't have a flush method - events are sent immediately
    // But we add a small delay to ensure any pending HTTP requests complete
    if (this.mixpanel) {
      flushPromises.push(
        new Promise<void>((resolve) => {
          setTimeout(() => {
            if (this.isDev) {
              console.log('[Analytics] Mixpanel shutdown complete.');
            }
            resolve();
          }, 500); // 500ms grace period for pending requests
        })
      );
    }

    await Promise.all(flushPromises);

    if (this.isDev) {
      console.log('[Analytics] Shutdown complete.');
    }
  }

  public getUserId(): string | null {
    return this.userId;
  }

  public getSessionId(): number {
    return this.sessionId;
  }
}

export const analyticsService = new AnalyticsService();
