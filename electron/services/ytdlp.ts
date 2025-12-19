/**
 * yt-dlp Service for Video Download
 * Reference: Youtube-dl-REST and YoutubeDownloader repositories
 */

import { app } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';
import http from 'http';
import https from 'https';

export interface VideoInfo {
  id: string;
  title: string;
  thumbnail: string;
  duration: number;
  uploader: string;
  platform: 'youtube' | 'bilibili';
  formats: VideoFormat[];
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
        message: '暂不支持下载播放列表，请使用单个视频链接',
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
        message: '暂不支持下载频道，请使用单个视频链接',
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
        message: '暂不支持下载番剧/影视内容（版权限制）',
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
        message: '暂不支持下载付费课程',
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
        message: '暂不支持下载直播内容',
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
        message: '暂不支持下载用户空间，请使用单个视频链接',
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
        message: '暂不支持下载收藏夹，请使用单个视频链接',
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
        message: '暂不支持下载活动专题页，请使用单个视频链接',
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
        message: '无法识别的视频链接格式，请检查URL是否正确',
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
      message: '仅支持 YouTube 和 Bilibili 视频链接',
      originalError: `Unsupported URL: ${trimmedUrl}`,
      retryable: false,
    },
  };
}

// Error classification helper - based on actual yt-dlp error messages
// Reference: https://github.com/yt-dlp/yt-dlp/wiki/Extractors
export function classifyError(stderr: string): DownloadError {
  const lowerError = stderr.toLowerCase();

  // Network errors - retryable
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
    lowerError.includes('unable to download video data')
  ) {
    return {
      type: 'network',
      message: '网络连接失败，请检查网络后重试',
      originalError: stderr,
      retryable: true,
    };
  }

  // YouTube rate limit: "This content isn't available, try again later"
  if (
    lowerError.includes("this content isn't available") ||
    lowerError.includes('try again later')
  ) {
    return {
      type: 'rate_limit',
      message: '请求过于频繁，YouTube 限制访问，请稍后再试（建议等待 5-10 秒）',
      originalError: stderr,
      retryable: true,
    };
  }

  // HTTP 403 Forbidden - often means need update yt-dlp or rate limit
  // Example: "HTTP Error 403: Forbidden"
  if (lowerError.includes('http error 403') || lowerError.includes('403 forbidden')) {
    return {
      type: 'rate_limit',
      message: '访问被拒绝 (403)，可能需要更新 yt-dlp 或稍后重试',
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
      message: '请求过于频繁，请稍后再试',
      originalError: stderr,
      retryable: true,
    };
  }

  // Private video - exact match from yt-dlp
  // Example: "ERROR: This video is private"
  if (lowerError.includes('this video is private') || lowerError.includes('video is private')) {
    return {
      type: 'private',
      message: '这是私密视频，无法下载',
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
      message: '视频不存在或已被删除',
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
      message: '需要登录账号才能下载 (可使用 --cookies-from-browser 参数)',
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
      message: '年龄限制内容，需要登录验证年龄',
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
      message: '该视频在您所在地区不可用（可尝试使用代理）',
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
      message: '这是付费/会员内容，需要购买后才能下载',
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
      message: '该视频已被UP主删除或设为不可见',
      originalError: stderr,
      retryable: false,
    };
  }

  // Bilibili-specific: UP主设置了观看限制
  if (lowerError.includes('仅粉丝') || lowerError.includes('仅限') || lowerError.includes('充电')) {
    return {
      type: 'paid',
      message: '该视频为UP主限定内容（粉丝/充电专属）',
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
      message: '不支持此链接类型，请检查URL是否正确',
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
      message: '所选清晰度不可用，请尝试其他画质',
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
      message: '解析响应失败，可能是临时网络问题，请重试',
      originalError: stderr,
      retryable: true,
    };
  }

  // Bilibili API status codes (from Bili23-Downloader)
  // Code 600: VIP required
  if (stderr.includes('"code":600') || stderr.includes('"code": 600')) {
    return {
      type: 'paid',
      message: '需要B站大会员才能观看此视频',
      originalError: stderr,
      retryable: false,
    };
  }

  // Code 601: Payment required
  if (stderr.includes('"code":601') || stderr.includes('"code": 601')) {
    return {
      type: 'paid',
      message: '这是付费视频，需要购买后才能下载',
      originalError: stderr,
      retryable: false,
    };
  }

  // Code 614: DRM protected
  if (
    stderr.includes('"code":614') ||
    stderr.includes('"code": 614') ||
    lowerError.includes('drm')
  ) {
    return {
      type: 'unsupported',
      message: '该视频有DRM加密保护，无法下载',
      originalError: stderr,
      retryable: false,
    };
  }

  // Code -10403: Region restricted
  if (stderr.includes('"code":-10403') || stderr.includes('"code": -10403')) {
    return {
      type: 'geo_blocked',
      message: '该视频仅限特定地区观看（版权限制）',
      originalError: stderr,
      retryable: false,
    };
  }

  // Code -101: Not logged in
  if (stderr.includes('"code":-101') || stderr.includes('"code": -101')) {
    return {
      type: 'login_required',
      message: '需要登录B站账号才能观看此视频',
      originalError: stderr,
      retryable: false,
    };
  }

  // Unknown error - may be retryable
  return {
    type: 'unknown',
    message: `下载失败: ${stderr.slice(0, 200)}`,
    originalError: stderr,
    retryable: true,
  };
}

class YtDlpService {
  private process: ChildProcess | null = null;
  private binaryPath: string;
  private quickjsPath: string;

  constructor() {
    const binaryName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
    const quickjsName = process.platform === 'win32' ? 'qjs.exe' : 'qjs';

    if (app.isPackaged) {
      // Production: binaries are in resources folder via extraResources
      this.binaryPath = path.join(process.resourcesPath, binaryName);
      this.quickjsPath = path.join(process.resourcesPath, quickjsName);
    } else {
      // Development: app.getAppPath() points to 'electron/' dir
      // resources folder is at project root (one level up)
      const projectRoot = path.join(app.getAppPath(), '..');
      this.binaryPath = path.join(projectRoot, 'resources', binaryName);
      this.quickjsPath = path.join(projectRoot, 'resources', quickjsName);
    }

    console.log('[DEBUG] [YtDlpService] Binary path:', this.binaryPath);
    console.log('[DEBUG] [YtDlpService] QuickJS path:', this.quickjsPath);
  }

  private execute(args: string[], timeoutMs: number = 60000): Promise<string> {
    return new Promise((resolve, reject) => {
      // Force UTF-8 output
      const options = {
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      };
      const proc = spawn(this.binaryPath, args, options);
      let stdout = '';
      let stderr = '';
      let killed = false;

      // Timeout handler
      const timeoutHandle = setTimeout(() => {
        killed = true;
        proc.kill('SIGTERM');
        reject(new Error(`yt-dlp 执行超时 (${timeoutMs / 1000}秒)`));
      }, timeoutMs);

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        clearTimeout(timeoutHandle);
        if (killed) return; // Already rejected by timeout
        if (code === 0) resolve(stdout);
        else reject(new Error(stderr || `yt-dlp exited with code ${code}`));
      });

      proc.on('error', (err) => {
        clearTimeout(timeoutHandle);
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
      throw new Error(validation.error?.message || '无效的视频链接');
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

    args.push('-j', '--no-playlist');

    // For Bilibili, if no ?p= specified but video has multiple parts,
    // yt-dlp will return JSON array. We handle first part by default.
    args.push(url);

    console.log(`[DEBUG] [Download] 执行解析命令: yt-dlp ${args.join(' ')}`);

    let output: string;
    try {
      output = await this.execute(args);
    } catch (error: any) {
      // Reference: Youtube-dl-REST tries with ?p=1 for Bilibili multi-part videos
      if (isBilibili && !url.includes('?p=')) {
        console.log(`[DEBUG] [Download] 尝试解析分P视频: ${url}?p=1`);
        try {
          const argsWithPart = [...args.slice(0, -1), `${url}?p=1`];
          output = await this.execute(argsWithPart);
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
      throw new Error('解析视频信息失败：无效的响应格式');
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
    const outputTemplate = path.join(outputDir, '%(title)s [%(id)s].%(ext)s');
    const baseArgs = fs.existsSync(this.quickjsPath)
      ? ['--js-runtimes', `quickjs:${this.quickjsPath}`]
      : [];

    // Map friendly format names to yt-dlp selectors
    let formatSelector = formatId;
    if (formatId === 'best') {
      formatSelector = 'bestvideo';
    } else if (formatId === '1080p') {
      formatSelector = 'bestvideo[height<=1080]';
    } else if (formatId === '720p') {
      formatSelector = 'bestvideo[height<=720]';
    } else if (formatId === '480p') {
      formatSelector = 'bestvideo[height<=480]';
    }

    const args = [
      ...baseArgs,
      '-f',
      `${formatSelector}+bestaudio/best`,
      '-o',
      outputTemplate,
      '--merge-output-format',
      'mp4',
      '--newline',
      '--force-overwrites', // Force overwrite existing files
      '--verbose', // Enable verbose logging
      '--encoding',
      'utf-8', // Force UTF-8 output
      url,
    ];

    return new Promise((resolve, reject) => {
      // Force UTF-8 output to fix mojibake on Windows
      const options = {
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      };
      this.process = spawn(this.binaryPath, args, options);
      let outputPath = '';
      let fileCount = 0;
      let currentStage: 'video' | 'audio' | 'merging' = 'video';

      this.process.stdout?.on('data', (data) => {
        const line = data.toString();

        // Parse destination to detect stage
        const destMatch = line.match(/\[download\] Destination: (.+)/);
        if (destMatch) {
          fileCount++;
          outputPath = destMatch[1].trim();
          console.log(`[DEBUG] [Download] 目标文件 (${fileCount}): ${outputPath}`);

          // Heuristic: 1st file is usually video, 2nd is audio (if split)
          if (fileCount === 1) currentStage = 'video';
          if (fileCount === 2) currentStage = 'audio';
        }

        // Merge message
        const mergeMatch = line.match(/\[Merger\] Merging formats into "(.+)"/);
        if (mergeMatch) {
          outputPath = mergeMatch[1].trim();
          console.log(`[DEBUG] [Download] 合并视频: ${outputPath}`);
          currentStage = 'merging';
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

        // Parse progress: [download]  45.2% of 100.00MiB at 12.50MiB/s ETA 00:05
        const progressMatch = line.match(
          /\[download\]\s+([\d.]+)%\s+of\s+([\d.]+\w+)\s+at\s+([\d.]+\w+\/s)\s+ETA\s+([\d:]+)/
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

      this.process.stderr?.on('data', (data) => {
        console.warn(`[Download] ${data.toString().trim()}`);
      });

      this.process.on('close', (code) => {
        this.process = null;
        if (code === 0) {
          console.log(`[DEBUG] [Download] 下载完成: ${outputPath}`);
          resolve(outputPath);
        } else {
          console.error(`[Download] 下载失败: 退出码 ${code}`);
          reject(new Error(`yt-dlp exited with code ${code}`));
        }
      });

      this.process.on('error', (err) => {
        this.process = null;
        console.error(`[Download] 进程错误: ${err.message}`);
        reject(err);
      });
    });
  }

  abort(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
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
}

export const ytDlpService = new YtDlpService();
