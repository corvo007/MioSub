/**
 * Video Preview Component - Tailwind CSS Version
 */
import React from 'react';
import type { VideoInfo } from '@/types/download';
import { formatDuration } from '@/services/subtitle/time';

interface VideoPreviewProps {
  videoInfo: VideoInfo;
}

export function VideoPreview({ videoInfo }: VideoPreviewProps) {
  const platformIcon = videoInfo.platform === 'youtube' ? '📺' : '📹';
  const platformName = videoInfo.platform === 'youtube' ? 'YouTube' : 'Bilibili';

  return (
    <div className="flex gap-5 mb-6">
      {/* Thumbnail */}
      <div className="relative w-50 h-28 rounded-lg overflow-hidden shrink-0">
        {videoInfo.thumbnail ? (
          <img
            src={videoInfo.thumbnail}
            alt={videoInfo.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-slate-200 text-3xl">
            🎬
          </div>
        )}
        <span className="absolute bottom-2 right-2 bg-black/80 px-2 py-0.5 rounded text-xs text-white shadow-sm">
          {formatDuration(videoInfo.duration)}
        </span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="text-lg font-bold text-slate-800 mb-3 leading-snug line-clamp-2">
          {videoInfo.title}
        </h3>
        <div className="flex gap-4 text-sm text-slate-500">
          <span>
            {platformIcon} {platformName}
          </span>
          <span className="truncate">{videoInfo.uploader}</span>
        </div>
      </div>
    </div>
  );
}
