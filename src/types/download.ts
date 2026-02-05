/**
 * Video Download Module Types
 */

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

export interface DownloadOptions {
  url: string;
  formatId: string;
  outputDir: string;
  taskId?: string;
  taskDescription?: string;
}

export interface DownloadProgress {
  percent: number;
  speed: string;
  eta: string;
  downloaded: number;
  total: number;
  stage?: 'video' | 'audio' | 'merging';
}

export interface ThumbnailDownloadOptions {
  thumbnailUrl: string;
  outputDir: string;
  videoTitle: string;
  videoId: string;
}

export type DownloadStatus = 'idle' | 'parsing' | 'downloading' | 'completed' | 'error';

// Error types for better UX
export type DownloadErrorType =
  | 'network' // 网络问题，可重试
  | 'rate_limit' // 频率限制，可稍后重试
  | 'geo_blocked' // 地区限制
  | 'private' // 私密视频
  | 'paid' // 付费内容
  | 'login_required' // 需要登录/cookies
  | 'age_restricted' // 年龄限制
  | 'unavailable' // 视频不存在或已被删除
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
