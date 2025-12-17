/**
 * File type detection utilities
 */

/** Common audio file extensions */
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'wma', 'opus'];

/** Common video file extensions */
const VIDEO_EXTENSIONS = [
  'mp4',
  'mkv',
  'avi',
  'mov',
  'wmv',
  'flv',
  'webm',
  'ts',
  'm2ts',
  'mts',
  'vob',
];

/**
 * Check if a file is a video file based on MIME type and extension
 */
export const isVideoFile = (file: File | null): boolean => {
  if (!file) return false;
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  return (
    file.type.startsWith('video/') ||
    (!AUDIO_EXTENSIONS.includes(ext) &&
      (file.type.startsWith('video/') || VIDEO_EXTENSIONS.includes(ext)))
  );
};

/**
 * Check if a file is an audio file based on MIME type and extension
 */
export const isAudioFile = (file: File | null): boolean => {
  if (!file) return false;
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  return file.type.startsWith('audio/') || AUDIO_EXTENSIONS.includes(ext);
};
