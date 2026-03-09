import type { UpdateInfo } from 'electron-updater';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdateState {
  status: UpdateStatus;
  info: UpdateInfo | null;
  error: string | null;
  progress: number;
}

// Binary update configuration
export const BINARY_REPOS = {
  aligner: { owner: 'Corvo007', repo: 'cpp-ctc-aligner' },
  ytdlp: { owner: 'yt-dlp', repo: 'yt-dlp' },
  whisper: { owner: 'Corvo007', repo: 'whisper.cpp' },
  bsroformer: { owner: 'Corvo007', repo: 'BSRoformer.cpp' },
} as const;

export type BinaryName = keyof typeof BINARY_REPOS;

// Companion libraries that must be installed alongside the main binary.
// Mirrors REQUIRED_FILES from scripts/binary-config.mjs (minus the main binary itself).
export const BINARY_COMPANIONS: Record<string, Record<string, string[]>> = {
  'cpp-ort-aligner': {
    'win32-x64': ['onnxruntime.dll'],
    'linux-x64': ['libonnxruntime.so', 'libonnxruntime.so.1'],
    'linux-arm64': ['libonnxruntime.so', 'libonnxruntime.so.1'],
    'darwin-x64': ['libonnxruntime.dylib'],
    'darwin-arm64': ['libonnxruntime.dylib'],
  },
};

export interface BinaryUpdateInfo {
  name: BinaryName;
  current: string;
  latest: string;
  hasUpdate: boolean;
  downloadUrl?: string;
  releaseUrl?: string;
}
