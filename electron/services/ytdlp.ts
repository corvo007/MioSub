/**
 * yt-dlp Service for Video Download
 * Reference: Youtube-dl-REST and YoutubeDownloader repositories
 */

import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';
import http from 'http';
import https from 'https';
import { t } from '../i18n.ts';
import * as Sentry from '@sentry/electron/main';
import { getBinaryPath } from '../utils/paths.ts';
import { ExpectedError } from '../utils/expectedError.ts';
import { buildSpawnArgs } from '../utils/shell.ts';

export interface VideoInfo {
  id: string;
  title: string;
  thumbnail: string;
  duration: number;
  uploader: string;
  platform: 'youtube' | 'bilibili';
  formats: VideoFormat[];
  language?: string; // Original language code (e.g., 'en-US', 'zh-CN')
  // Bilibili specific
  partNumber?: number; // 分P视频的当前P数
  totalParts?: number; // 分P视频的总P数
}

export interface VideoFormat {
  formatId: string;
  quality: string;
  ext: string;
  filesize?: number;
  hasAudio: boolean;
  hasVideo: boolean;
}

export interface DownloadProgress {
  percent: number;
  speed: string;
  eta: string;
  downloaded: number;
  total: number;
  stage?: 'video' | 'audio' | 'merging';
}

// Error types for better UX
export type DownloadErrorType =
  | 'network' // 网络问题，可重试
  | 'rate_limit' // 频率限制，可稍后重试
  | 'geo_blocked' // 地区限制
  | 'private' // 私密视频
  | 'paid' // 付费内容
  | 'login_required' // 需要登录/cookies
  | 'age_restricted' // 年龄限制
  | 'unavailable' // 视频不存在或已删除
  | 'unsupported' // 不支持的类型（课程、播放列表等）
  | 'format_unavailable' // 特定清晰度不可用
  | 'invalid_url' // 无效URL
  | 'unknown'; // 未知错误

export interface DownloadError {
  type: DownloadErrorType;
  message: string;
  originalError: string;
  retryable: boolean;
}

// ============================================================================
// URL Validation and Content Type Detection
// Reference: Youtube-dl-REST, Bili23-Downloader, bilibili-video-downloader
// ============================================================================

/** Bilibili API status codes (from Bili23-Downloader/enums.py) */
const BILIBILI_STATUS_CODES = {
  Success: 0,
  Vip: 600, // 需要会员
  Pay: 601, // 需要付费购买
  URL: 602, // 无效链接
  Redirect: 603, // 跳转链接
  DRM: 614, // DRM 加密
  Area_Limit: -10403, // 区域限制
  NotLogin: -101, // 未登录
};

/** Supported URL patterns */
const URL_PATTERNS = {
  // YouTube patterns
  youtube: {
    // Standard: https://www.youtube.com/watch?v=xxxxxxxxxxx
    // With playlist: https://www.youtube.com/watch?v=xxxxxxxxxxx&list=PLyyy&index=N
    // Short: https://youtu.be/xxxxxxxxxxx
    // Shorts: https://www.youtube.com/shorts/xxxxxxxxxxx
    // Mobile: https://m.youtube.com/watch?v=xxxxxxxxxxx
    video:
      /^https?:\/\/(?:youtu\.be\/|(?:www\.|m\.)?youtube\.com\/(?:watch(?:\/|\?v=)|shorts\/|embed\/|v\/))([\w-]{11})(?:[?&].*)?$/,
    // Playlist: https://www.youtube.com/playlist?list=PLxxxxxxxx
    playlist: /^https?:\/\/(?:www\.|m\.)?youtube\.com\/playlist\?list=(PL[\w-]+)/,
    // Channel: https://www.youtube.com/@channelname or /channel/UCxxxx
    channel: /^https?:\/\/(?:www\.|m\.)?youtube\.com\/(?:@[\w-]+|channel\/UC[\w-]+)/,
  },
  // Bilibili patterns (reference: Bili23-Downloader)
  bilibili: {
    // Standard video: BV or av number (supports ?p=X for multi-part)
    video: /^https?:\/\/(?:www\.|m\.)?bilibili\.com\/video\/((?:BV|av)[\w\d]+)\/?(?:\?.*)?$/,
    // B23 short link: https://b23.tv/xxxxxx (yt-dlp handles redirect)
    b23: /^https?:\/\/b23\.tv\/([\w]+)/,
    // Bangumi: ep=episode, ss=season, md=media (番剧/影视)
    bangumi: /^https?:\/\/(?:www\.)?bilibili\.com\/bangumi\/play\/(ep|ss|md)(\d+)/,
    // Course/Cheese: 付费课程
    course: /^https?:\/\/(?:www\.)?bilibili\.com\/cheese\/(?:play\/)?(ep|ss)(\d+)/,
    // Live stream: 直播
    live: /^https?:\/\/live\.bilibili\.com\/(\d+)/,
    // User space: 个人空间
    space: /^https?:\/\/space\.bilibili\.com\/(\d+)/,
    // Favorites: 收藏夹
    favorites: /^https?:\/\/(?:www\.)?bilibili\.com\/(?:medialist\/detail\/)?ml(\d+)/,
    // Festival/Activity: 活动专题
    festival: /^https?:\/\/(?:www\.)?bilibili\.com\/festival\/([\w]+)/,
  },
};

/** Content types that we support or don't support */
export interface UrlValidation {
  valid: boolean;
  platform: 'youtube' | 'bilibili' | null;
  contentType:
    | 'video'
    | 'playlist'
    | 'channel'
    | 'bangumi'
    | 'course'
    | 'live'
    | 'space'
    | 'favorites'
    | 'festival'
    | 'b23'
    | 'unsupported';
  videoId?: string;
  partNumber?: number; // Bilibili specific: ?p=X
  error?: DownloadError;
}

/**
 * Validate and parse URL before making yt-dlp calls
 * This provides instant feedback for invalid URLs
 */
export function validateUrl(url: string): UrlValidation {
  const trimmedUrl = url.trim();

  // Check YouTube patterns
  const ytVideoMatch = trimmedUrl.match(URL_PATTERNS.youtube.video);
  if (ytVideoMatch) {
    return {
      valid: true,
      platform: 'youtube',
      contentType: 'video',
      videoId: ytVideoMatch[1],
    };
  }

  const ytPlaylistMatch = trimmedUrl.match(URL_PATTERNS.youtube.playlist);
  if (ytPlaylistMatch) {
    return {
      valid: false,
      platform: 'youtube',
      contentType: 'playlist',
      error: {
        type: 'unsupported',
        message: t('ytdlp.playlistNotSupported'),
        originalError: 'YouTube playlist URL detected',
        retryable: false,
      },
    };
  }

  const ytChannelMatch = trimmedUrl.match(URL_PATTERNS.youtube.channel);
  if (ytChannelMatch) {
    return {
      valid: false,
      platform: 'youtube',
      contentType: 'channel',
      error: {
        type: 'unsupported',
        message: t('ytdlp.channelNotSupported'),
        originalError: 'YouTube channel URL detected',
        retryable: false,
      },
    };
  }

  // Check Bilibili patterns
  const biliVideoMatch = trimmedUrl.match(URL_PATTERNS.bilibili.video);
  if (biliVideoMatch) {
    // Extract part number from URL query string
    const partMatch = trimmedUrl.match(/[?&]p=(\d+)/);
    return {
      valid: true,
      platform: 'bilibili',
      contentType: 'video',
      videoId: biliVideoMatch[1],
      partNumber: partMatch ? parseInt(partMatch[1]) : undefined,
    };
  }

  // B23 short links: Let yt-dlp handle the redirect
  const b23Match = trimmedUrl.match(URL_PATTERNS.bilibili.b23);
  if (b23Match) {
    return {
      valid: true, // yt-dlp can handle b23.tv redirects
      platform: 'bilibili',
      contentType: 'b23',
      videoId: b23Match[1],
    };
  }

  const biliBangumiMatch = trimmedUrl.match(URL_PATTERNS.bilibili.bangumi);
  if (biliBangumiMatch) {
    return {
      valid: false,
      platform: 'bilibili',
      contentType: 'bangumi',
      error: {
        type: 'unsupported',
        message: t('ytdlp.bangumiNotSupported'),
        originalError: 'Bilibili bangumi URL detected',
        retryable: false,
      },
    };
  }

  const biliCourseMatch = trimmedUrl.match(URL_PATTERNS.bilibili.course);
  if (biliCourseMatch) {
    return {
      valid: false,
      platform: 'bilibili',
      contentType: 'course',
      error: {
        type: 'paid',
        message: t('ytdlp.courseNotSupported'),
        originalError: 'Bilibili course URL detected',
        retryable: false,
      },
    };
  }

  // Live stream: Not supported
  const biliLiveMatch = trimmedUrl.match(URL_PATTERNS.bilibili.live);
  if (biliLiveMatch) {
    return {
      valid: false,
      platform: 'bilibili',
      contentType: 'live',
      error: {
        type: 'unsupported',
        message: t('ytdlp.liveNotSupported'),
        originalError: 'Bilibili live URL detected',
        retryable: false,
      },
    };
  }

  // User space: Not supported
  const biliSpaceMatch = trimmedUrl.match(URL_PATTERNS.bilibili.space);
  if (biliSpaceMatch) {
    return {
      valid: false,
      platform: 'bilibili',
      contentType: 'space',
      error: {
        type: 'unsupported',
        message: t('ytdlp.userSpaceNotSupported'),
        originalError: 'Bilibili space URL detected',
        retryable: false,
      },
    };
  }

  // Favorites: Not supported
  const biliFavMatch = trimmedUrl.match(URL_PATTERNS.bilibili.favorites);
  if (biliFavMatch) {
    return {
      valid: false,
      platform: 'bilibili',
      contentType: 'favorites',
      error: {
        type: 'unsupported',
        message: t('ytdlp.favoritesNotSupported'),
        originalError: 'Bilibili favorites URL detected',
        retryable: false,
      },
    };
  }

  // Festival/Activity: Not supported
  const biliFestivalMatch = trimmedUrl.match(URL_PATTERNS.bilibili.festival);
  if (biliFestivalMatch) {
    return {
      valid: false,
      platform: 'bilibili',
      contentType: 'festival',
      error: {
        type: 'unsupported',
        message: t('ytdlp.festivalNotSupported'),
        originalError: 'Bilibili festival URL detected',
        retryable: false,
      },
    };
  }

  // Check if it's any bilibili or youtube URL (but unsupported format)
  if (
    trimmedUrl.includes('bilibili.com') ||
    trimmedUrl.includes('youtube.com') ||
    trimmedUrl.includes('youtu.be')
  ) {
    return {
      valid: false,
      platform: trimmedUrl.includes('bilibili') ? 'bilibili' : 'youtube',
      contentType: 'unsupported',
      error: {
        type: 'invalid_url',
        message: t('ytdlp.invalidUrlFormat'),
        originalError: `Unrecognized URL format: ${trimmedUrl}`,
        retryable: false,
      },
    };
  }

  // Completely unsupported URL
  return {
    valid: false,
    platform: null,
    contentType: 'unsupported',
    error: {
      type: 'unsupported',
      message: t('ytdlp.unsupportedPlatform'),
      originalError: `Unsupported URL: ${trimmedUrl}`,
      retryable: false,
    },
  };
}

// Error classification helper - based on actual yt-dlp error messages
// Reference: https://github.com/yt-dlp/yt-dlp/wiki/Extractors
export function classifyError(stderr: string): DownloadError {
  const lowerError = stderr.toLowerCase();

  // YouTube rate limit: "This content isn't available, try again later"
  if (
    lowerError.includes("this content isn't available") ||
    lowerError.includes('try again later')
  ) {
    return {
      type: 'rate_limit',
      message: t('ytdlp.youtubeRateLimit'),
      originalError: stderr,
      retryable: true,
    };
  }

  // HTTP 403 Forbidden - often means need update yt-dlp or rate limit
  // Example: "HTTP Error 403: Forbidden"
  if (lowerError.includes('http error 403') || lowerError.includes('403 forbidden')) {
    return {
      type: 'rate_limit',
      message: t('ytdlp.accessDenied'),
      originalError: stderr,
      retryable: true,
    };
  }

  // HTTP 429 Rate limiting - retryable after wait
  if (
    lowerError.includes('http error 429') ||
    lowerError.includes('too many requests') ||
    lowerError.includes('rate limit')
  ) {
    return {
      type: 'rate_limit',
      message: t('ytdlp.rateLimit'),
      originalError: stderr,
      retryable: true,
    };
  }

  // Private video - exact match from yt-dlp
  // Example: "ERROR: This video is private"
  if (lowerError.includes('this video is private') || lowerError.includes('video is private')) {
    return {
      type: 'private',
      message: t('ytdlp.privateVideo'),
      originalError: stderr,
      retryable: false,
    };
  }

  // Video unavailable - exact match from yt-dlp
  // Examples: "ERROR: This video is unavailable", "Video unavailable"
  if (
    lowerError.includes('this video is unavailable') ||
    lowerError.includes('video unavailable') ||
    lowerError.includes('this video is no longer available') ||
    lowerError.includes('video has been removed') ||
    lowerError.includes('http error 404')
  ) {
    return {
      type: 'unavailable',
      message: t('ytdlp.videoNotFound'),
      originalError: stderr,
      retryable: false,
    };
  }

  // Login required - yt-dlp common patterns
  // Examples: "login required", "Sign in to confirm your age", "cookies"
  if (
    lowerError.includes('login required') ||
    lowerError.includes('sign in') ||
    lowerError.includes('sign-in') ||
    lowerError.includes('need to log in') ||
    lowerError.includes('cookies') ||
    lowerError.includes('--cookies')
  ) {
    return {
      type: 'login_required',
      message: t('ytdlp.loginRequired'),
      originalError: stderr,
      retryable: false,
    };
  }

  // Age restricted content
  // Example: "Sign in to confirm your age"
  if (
    lowerError.includes('confirm your age') ||
    lowerError.includes('age-restricted') ||
    lowerError.includes('age restricted') ||
    lowerError.includes('age gate')
  ) {
    return {
      type: 'age_restricted',
      message: t('ytdlp.ageRestricted'),
      originalError: stderr,
      retryable: false,
    };
  }

  // Geo-blocked content
  // Example: "not available in your country"
  // Bilibili: "版权地区受限" (Copyright region restricted)
  if (
    lowerError.includes('not available in your country') ||
    lowerError.includes('not available in your region') ||
    lowerError.includes('版权地区受限') ||
    lowerError.includes('地区受限') ||
    lowerError.includes('仅限') ||
    lowerError.includes('geo') ||
    lowerError.includes('blocked in your')
  ) {
    return {
      type: 'geo_blocked',
      message: t('ytdlp.geoBlocked'),
      originalError: stderr,
      retryable: false,
    };
  }

  // Paid/Premium content
  // Examples: "requires payment", "premium", "member-only"
  if (
    lowerError.includes('requires payment') ||
    lowerError.includes('premium members') ||
    lowerError.includes('member-only') ||
    lowerError.includes('purchase required') ||
    lowerError.includes('paid video') ||
    lowerError.includes('需要购买') ||
    lowerError.includes('需要付费') ||
    lowerError.includes('大会员')
  ) {
    return {
      type: 'paid',
      message: t('ytdlp.paidContent'),
      originalError: stderr,
      retryable: false,
    };
  }

  // Bilibili-specific: 视频不见了/已失效
  if (
    lowerError.includes('视频不见了') ||
    lowerError.includes('视频已失效') ||
    lowerError.includes('稿件不可见')
  ) {
    return {
      type: 'unavailable',
      message: t('ytdlp.videoDeleted'),
      originalError: stderr,
      retryable: false,
    };
  }

  // Bilibili-specific: UP主设置了观看限制
  if (lowerError.includes('仅粉丝') || lowerError.includes('仅限') || lowerError.includes('充电')) {
    return {
      type: 'paid',
      message: t('ytdlp.fanOnly'),
      originalError: stderr,
      retryable: false,
    };
  }

  // Unsupported URL/extractor
  // Example: "Unsupported URL"
  if (
    lowerError.includes('unsupported url') ||
    lowerError.includes('no video found') ||
    lowerError.includes('unable to extract')
  ) {
    return {
      type: 'unsupported',
      message: t('ytdlp.unsupportedUrl'),
      originalError: stderr,
      retryable: false,
    };
  }

  // Format/Quality unavailable
  // Example: "requested format not available"
  if (
    lowerError.includes('requested format not available') ||
    lowerError.includes('format is not available') ||
    lowerError.includes('no video formats found')
  ) {
    return {
      type: 'format_unavailable',
      message: t('ytdlp.formatUnavailable'),
      originalError: stderr,
      retryable: false,
    };
  }

  // JSON parsing error - often indicates API changes or invalid response
  if (
    lowerError.includes('json') ||
    lowerError.includes('expecting value') ||
    lowerError.includes('decode')
  ) {
    return {
      type: 'network',
      message: t('ytdlp.parseError'),
      originalError: stderr,
      retryable: true,
    };
  }

  // Bilibili API status codes (from Bili23-Downloader)
  // Code 600: VIP required
  if (
    stderr.includes(`"code":${BILIBILI_STATUS_CODES.Vip}`) ||
    stderr.includes(`"code": ${BILIBILI_STATUS_CODES.Vip}`)
  ) {
    return {
      type: 'paid',
      message: t('ytdlp.vipRequired'),
      originalError: stderr,
      retryable: false,
    };
  }

  // Code 601: Payment required
  if (
    stderr.includes(`"code":${BILIBILI_STATUS_CODES.Pay}`) ||
    stderr.includes(`"code": ${BILIBILI_STATUS_CODES.Pay}`)
  ) {
    return {
      type: 'paid',
      message: t('ytdlp.paymentRequired'),
      originalError: stderr,
      retryable: false,
    };
  }

  // Code 614: DRM protected
  if (
    stderr.includes(`"code":${BILIBILI_STATUS_CODES.DRM}`) ||
    stderr.includes(`"code": ${BILIBILI_STATUS_CODES.DRM}`) ||
    lowerError.includes('drm')
  ) {
    return {
      type: 'unsupported',
      message: t('ytdlp.drmProtected'),
      originalError: stderr,
      retryable: false,
    };
  }

  // Code -10403: Region restricted
  if (
    stderr.includes(`"code":${BILIBILI_STATUS_CODES.Area_Limit}`) ||
    stderr.includes(`"code": ${BILIBILI_STATUS_CODES.Area_Limit}`)
  ) {
    return {
      type: 'geo_blocked',
      message: t('ytdlp.regionRestricted'),
      originalError: stderr,
      retryable: false,
    };
  }

  // Code -101: Not logged in
  if (
    stderr.includes(`"code":${BILIBILI_STATUS_CODES.NotLogin}`) ||
    stderr.includes(`"code": ${BILIBILI_STATUS_CODES.NotLogin}`)
  ) {
    return {
      type: 'login_required',
      message: t('ytdlp.biliLoginRequired'),
      originalError: stderr,
      retryable: false,
    };
  }

  // Network errors - retryable (Moved down to avoid masking specific errors)
  // Examples: "urlopen error", "connection", "timeout", "socket timeout"
  // Bilibili: "Remote end closed connection", "Connection aborted", "Read timed out"
  if (
    lowerError.includes('urlopen error') ||
    lowerError.includes('connection reset') ||
    lowerError.includes('connection refused') ||
    lowerError.includes('connection aborted') ||
    lowerError.includes('remote end closed connection') ||
    lowerError.includes('socket timeout') ||
    lowerError.includes('timed out') ||
    lowerError.includes('read timed out') ||
    lowerError.includes('network is unreachable') ||
    lowerError.includes('temporary failure in name resolution') ||
    lowerError.includes('unable to download video data') ||
    lowerError.includes('ssl') || // SSL errors
    lowerError.includes('certificate verify failed') ||
    lowerError.includes('handshake failure')
  ) {
    return {
      type: 'network',
      message: t('ytdlp.networkError'),
      originalError: stderr,
      retryable: true,
    };
  }

  // Unknown error - may be retryable
  return {
    type: 'unknown',
    message: t('ytdlp.downloadFailed', { error: stderr.slice(0, 200) }),
    originalError: stderr,
    retryable: true,
  };
}

class YtDlpService {
  private process: ChildProcess | null = null;
  private binaryPath: string;
  private quickjsPath: string;
  private ffmpegPath: string;
  // Track active parse processes (url -> process)
  private activeParseProcesses: Map<string, ChildProcess> = new Map();
  // Track active download output path for cleanup
  private currentDownloadOutputPath: string | null = null;

  constructor() {
    this.binaryPath = getBinaryPath('yt-dlp');
    this.quickjsPath = getBinaryPath('qjs');
    this.ffmpegPath = getBinaryPath('ffmpeg');

    // console.log('[DEBUG] [YtDlpService] Binary path:', this.binaryPath);
    // console.log('[DEBUG] [YtDlpService] QuickJS path:', this.quickjsPath);
    // console.log('[DEBUG] [YtDlpService] FFmpeg path:', this.ffmpegPath);
  }

  private execute(args: string[], timeoutMs: number = 60000, trackKey?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Build spawn arguments with UTF-8 code page support for Windows
      const spawnConfig = buildSpawnArgs(this.binaryPath, args);
      const options = {
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        ...spawnConfig.options,
      };
      const proc = spawn(spawnConfig.command, spawnConfig.args, options);

      if (trackKey) {
        this.activeParseProcesses.set(trackKey, proc);
      }

      let stdout = '';
      let stderr = '';
      let killed = false;

      // Timeout handler
      const timeoutHandle = setTimeout(() => {
        killed = true;
        proc.kill('SIGTERM');
        reject(new Error(t('error.ytdlpTimeout', { seconds: timeoutMs / 1000 })));
      }, timeoutMs);

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      proc.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;

        // Log errors/warnings in real-time
        const lowerChunk = chunk.toLowerCase();
        if (
          lowerChunk.includes('error') ||
          lowerChunk.includes('exception') ||
          lowerChunk.includes('failed') ||
          lowerChunk.includes('warning') ||
          lowerChunk.includes('fatal') ||
          lowerChunk.includes('panic')
        ) {
          console.warn(`[DEBUG] [yt-dlp] ${chunk.trim()}`);
        }
      });

      proc.on('close', (code) => {
        clearTimeout(timeoutHandle);
        if (trackKey) this.activeParseProcesses.delete(trackKey);
        if (killed) return; // Already rejected by timeout
        if (code === 0) resolve(stdout);
        else reject(new Error(stderr || `yt-dlp exited with code ${code}`));
      });

      proc.on('error', (err) => {
        clearTimeout(timeoutHandle);
        if (trackKey) this.activeParseProcesses.delete(trackKey);
        reject(err);
      });
    });
  }

  async parseUrl(url: string): Promise<VideoInfo> {
    console.log(`[DEBUG] [Download] 开始解析视频: ${url}`);

    // Step 1: Validate URL first for instant feedback
    const validation = validateUrl(url);
    if (!validation.valid) {
      console.warn(`[Download] URL验证失败: ${validation.error?.message}`);
      throw new ExpectedError(validation.error?.message || t('error.invalidVideoUrl'));
    }

    // Check binary exists before attempting download
    if (!fs.existsSync(this.binaryPath)) {
      throw new ExpectedError(t('preflight.downloadableBinaryNotFound', { name: 'yt-dlp' }));
    }

    const platform = validation.platform!;
    const isBilibili = platform === 'bilibili';
    const isYouTube = platform === 'youtube';

    // Step 2: Build yt-dlp arguments
    // Reference: Youtube-dl-REST handles Bilibili ?p= parameter
    const args: string[] = [];

    if (fs.existsSync(this.quickjsPath)) {
      // Use QuickJS if available to bypass JavaScript challenges
      args.push('--js-runtimes', `quickjs:${this.quickjsPath}`);
    }

    // Default robustness options
    args.push(
      '--impersonate',
      'chrome', // Browser impersonation to bypass bot detection
      '--retries',
      '5', // Retry count for download errors
      '--extractor-retries',
      '3' // Retry count for extractor errors
    );

    args.push('-j', '--no-playlist');

    // YouTube client configuration:
    // - web: blocked by SABR, needs PO token
    // - android: only 360p
    // - tv: DRM protected (issue #12563)
    // - mweb: needs PO token
    // Solution: Use default clients but exclude tv client
    // See: https://github.com/yt-dlp/yt-dlp/issues/12563
    // See: https://github.com/yt-dlp/yt-dlp/issues/12482
    if (isYouTube) {
      args.push('--extractor-args', 'youtube:player_client=default,-tv');
    }

    // For Bilibili, if no ?p= specified but video has multiple parts,
    // yt-dlp will return JSON array. We handle first part by default.
    args.push(url);

    console.log(`[DEBUG] [Download] 执行解析命令: yt-dlp ${args.join(' ')}`);

    let output: string;
    try {
      // Track with original URL
      output = await this.execute(args, 60000, url);
    } catch (error: any) {
      // Reference: Youtube-dl-REST tries with ?p=1 for Bilibili multi-part videos
      if (isBilibili && !url.includes('?p=')) {
        console.log(`[DEBUG] [Download] 尝试解析分P视频: ${url}?p=1`);
        try {
          const argsWithPart = [...args.slice(0, -1), `${url}?p=1`];
          // Use same URL key for retry
          output = await this.execute(argsWithPart, 60000, url);
        } catch {
          throw error; // Use original error if retry fails
        }
      } else {
        throw error;
      }
    }

    // Handle potential JSON array (Bilibili multi-part)
    let data: any;
    try {
      const parsed = JSON.parse(output);
      // If it's an array, take first element
      data = Array.isArray(parsed) ? parsed[0] : parsed;
    } catch {
      throw new ExpectedError(t('error.parseVideoFailed'));
    }

    // Extract formats with proper filtering
    const formats: VideoFormat[] = (data.formats || [])
      .filter((f: any) => f.vcodec !== 'none' && f.height)
      .map((f: any) => ({
        formatId: f.format_id,
        quality: `${f.height}p`,
        ext: f.ext,
        filesize: f.filesize || f.filesize_approx,
        hasAudio: f.acodec !== 'none',
        hasVideo: f.vcodec !== 'none',
      }))
      .reduce((acc: VideoFormat[], curr: VideoFormat) => {
        // Deduplicate by quality, prefer formats with audio
        const existing = acc.find((f) => f.quality === curr.quality);
        if (!existing) {
          acc.push(curr);
        } else if (curr.hasAudio && !existing.hasAudio) {
          // Replace with version that has audio
          const idx = acc.indexOf(existing);
          acc[idx] = curr;
        }
        return acc;
      }, [])
      .sort((a: VideoFormat, b: VideoFormat) => parseInt(b.quality) - parseInt(a.quality));

    // Extract Bilibili-specific info
    let partNumber: number | undefined;
    let totalParts: number | undefined;

    if (isBilibili) {
      // Check for multi-part video info
      // yt-dlp returns n_entries for total parts
      if (data.playlist_count) {
        totalParts = data.playlist_count;
      }
      // Try to extract current part from URL or data
      if (validation.partNumber) {
        partNumber = validation.partNumber;
      } else if (data.playlist_index) {
        partNumber = data.playlist_index;
      }
    }

    console.log(
      `[DEBUG] [Download] 解析成功: ${data.title} (${formats.length} 种画质)${partNumber ? ` [P${partNumber}${totalParts ? `/${totalParts}` : ''}]` : ''}`
    );

    return {
      id: data.id,
      title: data.title,
      thumbnail: data.thumbnail,
      duration: data.duration || 0,
      uploader: data.uploader || data.channel || '',
      platform,
      formats,
      language: data.language || undefined,
      partNumber,
      totalParts,
    };
  }

  async download(
    url: string,
    formatId: string,
    outputDir: string,
    onProgress: (progress: DownloadProgress) => void
  ): Promise<string> {
    console.log(`[DEBUG] [Download] 开始下载: formatId=${formatId}, 保存到: ${outputDir}`);
    // Add video ID to filename to prevent overwriting different videos with same title
    // Limit title to 80 characters to avoid path length issues (YouTube max is 100 chars)
    // Using .80s truncates at 80 characters (not bytes)
    const outputTemplate = path.join(outputDir, '%(title).80s [%(id)s].%(ext)s');
    const baseArgs = fs.existsSync(this.quickjsPath)
      ? ['--js-runtimes', `quickjs:${this.quickjsPath}`]
      : [];

    // Add ffmpeg location if our bundled ffmpeg exists
    if (this.ffmpegPath && fs.existsSync(this.ffmpegPath)) {
      // --ffmpeg-location expects the directory containing ffmpeg, not the file itself
      baseArgs.push('--ffmpeg-location', path.dirname(this.ffmpegPath));
    }

    // Default robustness options
    baseArgs.push(
      '--impersonate',
      'chrome', // Browser impersonation to bypass bot detection
      '-N',
      '4', // Parallel fragment downloads for faster HLS/DASH
      '--retries',
      '5', // Retry count for download errors
      '--extractor-retries',
      '3' // Retry count for extractor errors
    );

    // Map friendly format names to yt-dlp selectors
    // For YouTube, use bv* (video-only) to avoid m3u8 formats that bundle dubbed audio
    // m3u8 formats like 301-0, 301-1 etc. contain video+audio with different languages
    // We need video-only formats so we can separately select the original audio track
    let formatSelector = formatId;
    const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');

    if (formatId === 'best') {
      formatSelector = isYouTube ? 'bv*' : 'bestvideo';
    } else if (formatId === '1080p') {
      formatSelector = isYouTube ? 'bv*[height<=1080]' : 'bestvideo[height<=1080]';
    } else if (formatId === '720p') {
      formatSelector = isYouTube ? 'bv*[height<=720]' : 'bestvideo[height<=720]';
    } else if (formatId === '480p') {
      formatSelector = isYouTube ? 'bv*[height<=480]' : 'bestvideo[height<=480]';
    } else {
      // Handle any quality string in format "XXXp" (e.g., "2160p", "1440p", "360p")
      const heightMatch = formatId.match(/^(\d+)p$/);
      if (heightMatch) {
        const height = heightMatch[1];
        formatSelector = isYouTube ? `bv*[height<=${height}]` : `bestvideo[height<=${height}]`;
      }
      // If not a quality string, formatSelector remains as formatId (raw format ID)
    }

    // For YouTube, prefer original audio track over dubbed/translated tracks
    // YouTube's multi-audio feature often includes AI-dubbed tracks that yt-dlp
    // may select as "bestaudio" due to higher bitrate.
    // Strategy: Use format_note*=original to select the original audio track.
    // This is more reliable than language-based selection for mixed-language videos.
    // See: https://github.com/yt-dlp/yt-dlp/issues/9498
    //
    // Format string structure for YouTube:
    //   video+original_audio / video+any_audio / best
    // This ensures we always get video, with original audio preferred.
    let formatString: string;
    if (isYouTube) {
      formatString = `${formatSelector}+bestaudio[format_note*=original]/${formatSelector}+bestaudio/best`;
    } else {
      formatString = `${formatSelector}+bestaudio/best`;
    }

    const args = [
      ...baseArgs,
      '-f',
      formatString,
      '-o',
      outputTemplate,
      '--merge-output-format',
      'mp4',
      '--newline',
      '--force-overwrites', // Force overwrite existing files
      '--verbose', // Enable verbose logging
      '--encoding',
      'utf-8', // Force UTF-8 output
      // Exclude tv client due to DRM issues (issue #12563)
      // See: https://github.com/yt-dlp/yt-dlp/issues/12563
      ...(isYouTube ? ['--extractor-args', 'youtube:player_client=default,-tv'] : []),
      url,
    ];

    // Log the full command for debugging
    console.log(`[DEBUG] [Download] 执行命令: yt-dlp ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
      // Build spawn arguments with UTF-8 code page support for Windows
      const spawnConfig = buildSpawnArgs(this.binaryPath, args);
      const options = {
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        ...spawnConfig.options,
      };
      this.process = spawn(spawnConfig.command, spawnConfig.args, options);
      let outputPath = '';
      let fileCount = 0;
      let currentStage: 'video' | 'audio' | 'merging' = 'video';

      this.currentDownloadOutputPath = null;

      this.process.stdout?.on('data', (data) => {
        const line = data.toString().trim();
        if (!line) return;

        // Log non-progress output for debugging (skip noisy progress lines)
        if (!line.match(/\[download\]\s+[\d.]+%/)) {
          console.log(`[Download] ${line}`);
        }

        // Parse destination to detect stage
        const destMatch = line.match(/\[download\] Destination: (.+)/);
        if (destMatch) {
          fileCount++;
          outputPath = destMatch[1].trim();

          // Heuristic: 1st file is usually video, 2nd is audio (if split)
          if (fileCount === 1) currentStage = 'video';
          if (fileCount === 2) currentStage = 'audio';
        }

        // Merge message
        const mergeMatch = line.match(/\[Merger\] Merging formats into "(.+)"/);
        if (mergeMatch) {
          outputPath = mergeMatch[1].trim();
          currentStage = 'merging';
          // Update current path for cleanup if needed
          this.currentDownloadOutputPath = outputPath;
          // Send a merging progress update
          onProgress({
            percent: 100,
            speed: '',
            eta: '',
            downloaded: 0,
            total: 0,
            stage: 'merging',
          });
        }

        // Parse progress - supports two formats:
        // Format 1: [download]  45.2% of 100.00MiB at 12.50MiB/s ETA 00:05
        // Format 2: [download]   5.8% of ~ 128.64MiB at    3.49MiB/s ETA 00:45 (frag 4/86)
        const progressMatch = line.match(
          /\[download\]\s+([\d.]+)%\s+of\s+~?\s*([\d.]+\w+)\s+at\s+([\d.]+\w+\/s)\s+ETA\s+([\d:]+)/
        );
        if (progressMatch) {
          onProgress({
            percent: parseFloat(progressMatch[1]),
            speed: progressMatch[3],
            eta: progressMatch[4],
            downloaded: 0,
            total: 0,
            stage: currentStage,
          });
        }
      });

      let stderrOutput = '';
      this.process.stderr?.on('data', (data) => {
        const chunk = data.toString();
        stderrOutput += chunk;
        console.warn(`[Download] ${chunk.trim()}`);
      });

      this.process.on('close', (code) => {
        this.process = null;
        if (code === 0) {
          console.log(`[DEBUG] [Download] 下载完成: ${outputPath}`);
          this.currentDownloadOutputPath = null;
          resolve(outputPath);
        } else {
          // Cleanup partial file on failure if we know the path
          if (this.currentDownloadOutputPath && fs.existsSync(this.currentDownloadOutputPath)) {
            try {
              fs.unlinkSync(this.currentDownloadOutputPath);
              console.log(
                `[Download] Deleted partial file on failure: ${this.currentDownloadOutputPath}`
              );
            } catch (e) {
              console.warn(`[Download] Failed to delete partial file: ${e}`);
            }
          }
          this.currentDownloadOutputPath = null;

          console.error('[Download] 下载失败', {
            exitCode: code,
            url,
            formatId,
            outputDir,
          });

          const errorMessage = stderrOutput.trim() || `yt-dlp exited with code ${code}`;
          reject(new Error(errorMessage));
        }
      });

      this.process.on('error', (err: any) => {
        this.process = null;
        console.error('[Download] 进程错误', {
          error: err.message,
          code: err.code,
          binaryPath: this.binaryPath,
        });
        reject(err);
      });
    });
  }

  abort(): void {
    if (this.process) {
      this.process.kill();

      // Cleanup partial file on abort
      if (this.currentDownloadOutputPath) {
        const pathToDelete = this.currentDownloadOutputPath;
        // Wait briefly for process to die and release locks
        setTimeout(() => {
          if (fs.existsSync(pathToDelete)) {
            try {
              fs.unlinkSync(pathToDelete);
              console.log(`[Download] Deleted partial file on abort: ${pathToDelete}`);
            } catch (e) {
              console.warn(`[Download] Failed to delete partial file on abort: ${e}`);
            }
          }
        }, 500);
      }
      this.currentDownloadOutputPath = null;
      this.process = null;
    }
  }

  /**
   * Cancel an active parse operation
   */
  cancelParse(url: string): boolean {
    const proc = this.activeParseProcesses.get(url);
    if (proc) {
      proc.kill();
      this.activeParseProcesses.delete(url);
      console.log(`[YtDlpService] Cancelled parsing for: ${url}`);
      return true;
    }
    return false;
  }

  getDefaultOutputDir(): string {
    return path.join(os.homedir(), 'Downloads');
  }

  /**
   * 下载视频封面
   * @param thumbnailUrl 封面URL
   * @param outputDir 输出目录
   * @param videoTitle 视频标题（用于生成文件名）
   * @param videoId 视频ID（用于防止文件名冲突）
   */
  async downloadThumbnail(
    thumbnailUrl: string,
    outputDir: string,
    videoTitle: string,
    videoId: string
  ): Promise<string> {
    console.log(`[DEBUG] [Download] 开始下载封面: ${thumbnailUrl}`);

    // Sanitize title for use in filename
    const sanitizedTitle = videoTitle
      .replace(/[<>:"/\\|?*]/g, '_') // Remove illegal filename characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .slice(0, 100); // Limit length

    // Determine file extension from URL
    const urlPath = new URL(thumbnailUrl).pathname;
    let ext = path.extname(urlPath).toLowerCase();
    if (!ext || !['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
      ext = '.jpg'; // Default to jpg
    }

    const outputPath = path.join(outputDir, `${sanitizedTitle} [${videoId}]_cover${ext}`);

    return new Promise((resolve, reject) => {
      const protocol = thumbnailUrl.startsWith('https') ? https : http;

      const request = protocol.get(thumbnailUrl, (response: any) => {
        // Handle redirects
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          console.log(`[DEBUG] [Download] 封面重定向到: ${response.headers.location}`);
          this.downloadThumbnail(response.headers.location, outputDir, videoTitle, videoId)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`封面下载失败: HTTP ${response.statusCode}`));
          return;
        }

        const fileStream = fs.createWriteStream(outputPath);
        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          console.log(`[DEBUG] [Download] 封面下载完成: ${outputPath}`);
          resolve(outputPath);
        });

        fileStream.on('error', (err: Error) => {
          fs.unlink(outputPath, () => {}); // Delete partial file
          reject(err);
        });
      });

      request.on('error', (err: Error) => {
        console.error(`[Download] 封面下载错误: ${err.message}`);
        reject(err);
      });

      request.setTimeout(30000, () => {
        request.destroy();
        reject(new Error('封面下载超时'));
      });
    });
  }

  async getVersions(): Promise<{ ytdlp: string; qjs: string }> {
    let ytdlpVersion = fs.existsSync(this.binaryPath) ? 'unknown' : 'Not found';
    let qjsVersion = 'unknown';

    if (ytdlpVersion !== 'Not found') {
      try {
        const ytdlpOutput = await this.execute(['--version']);
        ytdlpVersion = ytdlpOutput.trim();
      } catch (error: any) {
        console.warn('[YtDlpService] Failed to get yt-dlp version', {
          error: error.message,
          code: error.code,
          binaryPath: this.binaryPath,
        });
        Sentry.captureException(error, { tags: { action: 'ytdlp-version' } });
      }
    }

    try {
      // QuickJS version is usually on the first line of help output
      const { spawnSync } = await import('child_process');
      const result = spawnSync(this.quickjsPath, ['-h'], { encoding: 'utf-8', windowsHide: true });
      const output = result.stdout || result.stderr || '';
      const firstLine = output.split('\n')[0];
      if (firstLine.includes('QuickJS version')) {
        qjsVersion = firstLine.replace('QuickJS version ', '').trim();
      } else {
        console.warn(
          `[YtDlpService] QuickJS version parse failed, output: ${output.trim().slice(0, 200)}`
        );
        Sentry.captureMessage('QuickJS version parse failed', {
          level: 'warning',
          extra: { output: output.trim().slice(0, 500) },
        });
      }
    } catch (error: any) {
      console.warn('[YtDlpService] Failed to get QuickJS version', {
        error: error.message,
        code: error.code,
        quickjsPath: this.quickjsPath,
      });
      Sentry.captureException(error, { tags: { action: 'quickjs-version' } });
    }

    return { ytdlp: ytdlpVersion, qjs: qjsVersion };
  }
}

export const ytDlpService = new YtDlpService();
