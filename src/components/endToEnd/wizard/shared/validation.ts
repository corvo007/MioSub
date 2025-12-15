/** URL 验证辅助函数 */
export function isValidVideoUrl(url: string): {
  valid: boolean;
  platform?: string;
  error?: string;
} {
  if (!url || !url.trim()) {
    return { valid: false, error: '请输入视频链接' };
  }

  const trimmedUrl = url.trim();

  // Check basic URL format
  try {
    new URL(trimmedUrl);
  } catch {
    return { valid: false, error: '链接格式无效' };
  }

  // YouTube patterns
  const youtubePatterns = [
    /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
    /^https?:\/\/youtu\.be\/[\w-]+/,
    /^https?:\/\/(www\.)?youtube\.com\/shorts\/[\w-]+/,
  ];

  // Bilibili patterns
  const bilibiliPatterns = [
    /^https?:\/\/(www\.)?bilibili\.com\/video\/[A-Za-z0-9]+/,
    /^https?:\/\/b23\.tv\/[A-Za-z0-9]+/,
  ];

  if (youtubePatterns.some((p) => p.test(trimmedUrl))) {
    return { valid: true, platform: 'YouTube' };
  }

  if (bilibiliPatterns.some((p) => p.test(trimmedUrl))) {
    return { valid: true, platform: 'Bilibili' };
  }

  // Allow other URLs but warn user
  return { valid: true, platform: '其他', error: '可能不支持此平台，将尝试解析' };
}
