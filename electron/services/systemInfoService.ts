/**
 * System Info Service
 *
 * Centralized service for collecting system and binary version information.
 * Uses hash-based caching to detect actual file changes.
 *
 * This consolidates the previous getSystemInfo/getSystemConfigHash logic
 * and replaces the redundant binaryInfoService.
 */

import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { getBinaryPath, getFileHash, getLogDir, getStorageDir } from '../utils/paths.ts';
import { storageService } from './storage.ts';
import { localWhisperService } from './localWhisper.ts';
import { ctcAlignerService } from './ctcAligner.ts';
import { ytDlpService } from './ytdlp.ts';
import { getCompressorInstance } from './videoCompressor.ts';
import { isRealVersion } from '../utils/version.ts';

// ============================================================================
// Types
// ============================================================================

export interface SystemConfig {
  hash: string;
  settings: any;
  pkg: any;
  commitHash: string;
  customWhisperPath?: string;
  customAlignerPath?: string;
}

export interface WhisperDetails {
  path: string;
  source: 'Custom' | 'Bundled' | 'Portable' | 'Dev' | 'unknown';
  version: string;
  gpuSupport: boolean;
}

export interface SystemInfo {
  hash: string;
  appName: string;
  version: string;
  isPackaged: boolean;
  commitHash: string;
  versions: {
    ffmpeg: string;
    ffprobe: string;
    ytdlp: string;
    qjs: string;
    whisper: string;
    aligner: string;
    whisperDetails: WhisperDetails;
  };
  gpu: {
    available: boolean;
    encoders?: {
      h264_nvenc: boolean;
      hevc_nvenc: boolean;
      h264_qsv: boolean;
      hevc_qsv: boolean;
      h264_amf: boolean;
      hevc_amf: boolean;
    };
    preferredH264?: string;
    preferredH265?: string;
  };
  paths: {
    appPath: string;
    userDataPath: string;
    logPath: string;
    exePath: string;
    whisperPath: string;
    alignerPath: string;
  };
}

// ============================================================================
// System Info Service
// ============================================================================

class SystemInfoService {
  private cache: SystemInfo | null = null;
  private cacheHash: string | null = null;
  private cachedCommitHash: string | null = null;

  /**
   * Calculate system configuration hash based on settings, environment AND file mtimes.
   * This ensures updates to binaries (even in-place) are detected.
   */
  async getConfigHash(): Promise<SystemConfig> {
    // In dev: app.getAppPath() returns 'electron/', need to go up one level
    // In packaged: app.getAppPath() returns 'app.asar', package.json is inside
    const pkgPath = app.isPackaged
      ? path.join(app.getAppPath(), 'package.json')
      : path.join(app.getAppPath(), '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    // Read settings
    const settings = await storageService.readSettings();
    const customWhisperPath = settings?.localWhisperBinaryPath;
    const customAlignerPath = settings?.enhance?.alignment?.alignerPath;

    // Resolve ACTUAL binary paths to detect auto-discovery or in-place updates
    const whisperInfo = localWhisperService.getBinaryPathWithSource(customWhisperPath);

    // For FFmpeg/FFprobe, check custom path or fallback to bundled path
    const ffmpegPath = settings?.debug?.ffmpegPath || getBinaryPath('ffmpeg');
    const ffprobePath = settings?.debug?.ffprobePath || getBinaryPath('ffprobe');
    const ytDlpPath = getBinaryPath('yt-dlp');
    const qjsPath = getBinaryPath('qjs');
    const alignerPath = customAlignerPath || getBinaryPath('cpp-ort-aligner');

    // Check mtime for both (whether custom or bundled)
    const ffmpegHash = getFileHash(ffmpegPath);
    const ffprobeHash = getFileHash(ffprobePath);
    const ytDlpHash = getFileHash(ytDlpPath);
    const qjsHash = getFileHash(qjsPath);
    const whisperHash = getFileHash(whisperInfo.path);
    const alignerHash = getFileHash(alignerPath);

    // Get commit hash (cached)
    if (!this.cachedCommitHash) {
      if (app.isPackaged && process.env.COMMIT_HASH) {
        this.cachedCommitHash = process.env.COMMIT_HASH;
      } else {
        const { execSync } = await import('child_process');
        try {
          this.cachedCommitHash = execSync('git rev-parse --short HEAD', {
            encoding: 'utf-8',
            windowsHide: true,
          }).trim();
        } catch {
          this.cachedCommitHash = 'N/A';
        }
      }
    }

    // Create hash (include custom paths so path changes invalidate cache)
    const hash = [
      `v:${pkg.version}`,
      `c:${this.cachedCommitHash}`,
      `w:${whisperHash}`,
      `wp:${customWhisperPath || 'default'}`,
      `ff:${ffmpegHash}`,
      `fp:${ffprobeHash}`,
      `yd:${ytDlpHash}`,
      `qj:${qjsHash}`,
      `al:${alignerHash}`,
      `p:${process.env.PORTABLE_EXECUTABLE_DIR || 'none'}`,
    ].join('|');

    return {
      hash,
      settings,
      pkg,
      commitHash: this.cachedCommitHash,
      customWhisperPath,
      customAlignerPath,
    };
  }

  /**
   * Get full system information (versions, GPU status, paths).
   * Uses hash-based caching - only refreshes when binaries actually change.
   */
  async getInfo(preConfig?: SystemConfig): Promise<SystemInfo> {
    const config = preConfig || (await this.getConfigHash());

    // Check cache - if hash matches, return cached info
    if (this.cache && this.cacheHash === config.hash) {
      return this.cache;
    }

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // Get dependency versions (these are the "heavy" operations)
    const ytDlpInfo = await ytDlpService.getVersions();
    const whisperDetails = await localWhisperService.getWhisperDetails(config.customWhisperPath);
    const whisperVersionStr =
      whisperDetails.version === 'Not found'
        ? 'Not found'
        : `${whisperDetails.version} (${whisperDetails.source}${whisperDetails.gpuSupport ? ' + GPU' : ''})`;

    const alignerVersionRaw = await ctcAlignerService.getVersion(config.customAlignerPath);
    let alignerVersion = alignerVersionRaw;
    if (isRealVersion(alignerVersionRaw)) {
      alignerVersion = `v${alignerVersionRaw}`;
    }

    // Get FFmpeg/FFprobe versions
    let ffmpegVersion = 'unknown';
    let ffprobeVersion = 'unknown';
    try {
      const ffmpegPath = getBinaryPath('ffmpeg');
      const ffprobePath = getBinaryPath('ffprobe');

      const [ffmpegResult, ffprobeResult] = await Promise.all([
        execAsync(`"${ffmpegPath}" -version`, { windowsHide: true }).catch(() => ({ stdout: '' })),
        execAsync(`"${ffprobePath}" -version`, { windowsHide: true }).catch(() => ({ stdout: '' })),
      ]);

      const ffmpegMatch = ffmpegResult.stdout.match(/ffmpeg version (.*?) Copyright/);
      if (ffmpegMatch) ffmpegVersion = ffmpegMatch[1].trim();

      const ffprobeMatch = ffprobeResult.stdout.match(/ffprobe version (.*?) Copyright/);
      if (ffprobeMatch) ffprobeVersion = ffprobeMatch[1].trim();
    } catch {
      // FFmpeg not found
    }

    const hwAccelInfo = await getCompressorInstance().getHardwareAccelInfo();

    const info: SystemInfo = {
      hash: config.hash,
      appName: config.pkg.productName || config.pkg.name,
      version: config.pkg.version,
      isPackaged: app.isPackaged,
      commitHash: config.commitHash,
      versions: {
        ffmpeg: ffmpegVersion,
        ffprobe: ffprobeVersion,
        ytdlp: ytDlpInfo.ytdlp,
        qjs: ytDlpInfo.qjs,
        whisper: whisperVersionStr,
        aligner: alignerVersion,
        whisperDetails,
      },
      gpu: hwAccelInfo,
      paths: {
        appPath: app.getAppPath(),
        userDataPath: getStorageDir(),
        logPath: getLogDir(),
        exePath: app.getPath('exe'),
        whisperPath: whisperDetails.path,
        alignerPath: config.customAlignerPath || getBinaryPath('cpp-ort-aligner'),
      },
    };

    // Update cache
    this.cache = info;
    this.cacheHash = config.hash;

    return info;
  }

  /**
   * Get cached info without triggering collection.
   * Returns null if no cache exists.
   */
  getCached(): SystemInfo | null {
    return this.cache;
  }

  /**
   * Format system info for Sentry context.
   */
  getForSentry(info?: SystemInfo | null): Record<string, string | boolean> {
    const data = info || this.cache;
    if (!data) {
      return { binaries_collected: false };
    }

    return {
      whisper_version: data.versions.whisperDetails.version,
      whisper_source: data.versions.whisperDetails.source,
      whisper_gpu: data.versions.whisperDetails.gpuSupport,
      ffmpeg_version: data.versions.ffmpeg,
      ffmpeg_hw_h264: data.gpu.preferredH264 || 'libx264',
      ffmpeg_hw_h265: data.gpu.preferredH265 || 'libx265',
      aligner_version: data.versions.aligner,
      ytdlp_version: data.versions.ytdlp,
      qjs_version: data.versions.qjs,
    };
  }

  /**
   * Format system info for Analytics events.
   */
  getForAnalytics(info?: SystemInfo | null): Record<string, string | boolean> {
    const data = info || this.cache;
    if (!data) {
      return {};
    }

    return {
      whisper_version: data.versions.whisperDetails.version,
      whisper_source: data.versions.whisperDetails.source,
      whisper_gpu: data.versions.whisperDetails.gpuSupport,
      ffmpeg_version: data.versions.ffmpeg,
      ffmpeg_hw_h264: data.gpu.preferredH264 || 'libx264',
      ffmpeg_hw_h265: data.gpu.preferredH265 || 'libx265',
      ffmpeg_nvenc: data.gpu.encoders?.h264_nvenc || false,
      ffmpeg_qsv: data.gpu.encoders?.h264_qsv || false,
      ffmpeg_amf: data.gpu.encoders?.h264_amf || false,
      aligner_version: data.versions.aligner,
      ytdlp_version: data.versions.ytdlp,
      qjs_version: data.versions.qjs,
    };
  }
}

export const systemInfoService = new SystemInfoService();
