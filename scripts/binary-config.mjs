/**
 * Binary download configuration for all supported platforms
 * Platform identifiers: win32-x64, linux-x64, linux-arm64, darwin-x64, darwin-arm64
 */

export const BINARIES = {
  ffmpeg: {
    'win32-x64': {
      url: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
      type: 'zip',
      extract: [
        { from: 'ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe', to: 'ffmpeg.exe' },
        { from: 'ffmpeg-master-latest-win64-gpl/bin/ffprobe.exe', to: 'ffprobe.exe' },
      ],
    },
    'linux-x64': {
      url: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz',
      type: 'tar.xz',
      extract: [
        { from: 'ffmpeg-master-latest-linux64-gpl/bin/ffmpeg', to: 'ffmpeg' },
        { from: 'ffmpeg-master-latest-linux64-gpl/bin/ffprobe', to: 'ffprobe' },
      ],
    },
    'linux-arm64': {
      url: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linuxarm64-gpl.tar.xz',
      type: 'tar.xz',
      extract: [
        { from: 'ffmpeg-master-latest-linuxarm64-gpl/bin/ffmpeg', to: 'ffmpeg' },
        { from: 'ffmpeg-master-latest-linuxarm64-gpl/bin/ffprobe', to: 'ffprobe' },
      ],
    },
    'darwin-x64': {
      urls: [
        { url: 'https://evermeet.cx/ffmpeg/ffmpeg-8.0.1.7z', type: '7z', to: 'ffmpeg' },
        { url: 'https://evermeet.cx/ffmpeg/ffprobe-8.0.1.7z', type: '7z', to: 'ffprobe' },
      ],
    },
    'darwin-arm64': {
      urls: [
        { url: 'https://ffmpeg.martin-riedl.de/download/macos/arm64/1766430132_8.0.1/ffmpeg.zip', type: 'zip', to: 'ffmpeg' },
        { url: 'https://ffmpeg.martin-riedl.de/download/macos/arm64/1766430132_8.0.1/ffprobe.zip', type: 'zip', to: 'ffprobe' },
      ],
    },
  },

  'yt-dlp': {
    'win32-x64': {
      url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
      type: 'binary',
      to: 'yt-dlp.exe',
    },
    'linux-x64': {
      url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux',
      type: 'binary',
      to: 'yt-dlp',
    },
    'linux-arm64': {
      url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64',
      type: 'binary',
      to: 'yt-dlp',
    },
    'darwin-x64': {
      url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos',
      type: 'binary',
      to: 'yt-dlp',
    },
    'darwin-arm64': {
      url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos',
      type: 'binary',
      to: 'yt-dlp',
    },
  },

  quickjs: {
    // Universal binary (platform-independent cosmopolitan build)
    'win32-x64': {
      url: 'https://bellard.org/quickjs/binary_releases/quickjs-cosmo-2025-09-13.zip',
      type: 'zip',
      extract: [{ from: 'qjs', to: 'qjs.exe' }],
    },
    'linux-x64': {
      url: 'https://bellard.org/quickjs/binary_releases/quickjs-cosmo-2025-09-13.zip',
      type: 'zip',
      extract: [{ from: 'qjs', to: 'qjs' }],
    },
    'linux-arm64': {
      url: 'https://bellard.org/quickjs/binary_releases/quickjs-cosmo-2025-09-13.zip',
      type: 'zip',
      extract: [{ from: 'qjs', to: 'qjs' }],
    },
    'darwin-x64': {
      url: 'https://bellard.org/quickjs/binary_releases/quickjs-cosmo-2025-09-13.zip',
      type: 'zip',
      extract: [{ from: 'qjs', to: 'qjs' }],
    },
    'darwin-arm64': {
      url: 'https://bellard.org/quickjs/binary_releases/quickjs-cosmo-2025-09-13.zip',
      type: 'zip',
      extract: [{ from: 'qjs', to: 'qjs' }],
    },
  },

  whisper: {
    'win32-x64': {
      url: 'https://github.com/corvo007/whisper.cpp/releases/latest/download/whisper-windows-x86_64.zip',
      type: 'zip',
      extract: [
        { from: 'whisper-cli.exe', to: 'whisper-cli.exe' },
      ],
    },
    'linux-x64': {
      url: 'https://github.com/corvo007/whisper.cpp/releases/latest/download/whisper-linux-x86_64.tar.gz',
      type: 'tar.gz',
      extract: [{ from: 'whisper-cli', to: 'whisper-cli' }],
    },
    'linux-arm64': {
      url: 'https://github.com/corvo007/whisper.cpp/releases/latest/download/whisper-linux-arm64.tar.gz',
      type: 'tar.gz',
      extract: [{ from: 'whisper-cli', to: 'whisper-cli' }],
    },
    'darwin-x64': {
      url: 'https://github.com/corvo007/whisper.cpp/releases/latest/download/whisper-macos-x86_64.tar.gz',
      type: 'tar.gz',
      extract: [{ from: 'whisper-cli', to: 'whisper-cli' }],
    },
    'darwin-arm64': {
      url: 'https://github.com/corvo007/whisper.cpp/releases/latest/download/whisper-macos-arm64.tar.gz',
      type: 'tar.gz',
      extract: [{ from: 'whisper-cli', to: 'whisper-cli' }],
    },
  },

  'cpp-ort-aligner': {
    'win32-x64': {
      url: 'https://github.com/corvo007/cpp-ctc-aligner/releases/latest/download/cpp-ort-aligner-windows-x64.zip',
      type: 'zip',
      extractAll: true,
    },
    'linux-x64': {
      url: 'https://github.com/corvo007/cpp-ctc-aligner/releases/latest/download/cpp-ort-aligner-linux-x64.tar.gz',
      type: 'tar.gz',
      extractAll: true,
    },
    'linux-arm64': {
      url: 'https://github.com/corvo007/cpp-ctc-aligner/releases/latest/download/cpp-ort-aligner-linux-arm64.tar.gz',
      type: 'tar.gz',
      extractAll: true,
    },
    'darwin-x64': {
      url: 'https://github.com/corvo007/cpp-ctc-aligner/releases/latest/download/cpp-ort-aligner-macos-universal2.tar.gz',
      type: 'tar.gz',
      extractAll: true,
    },
    'darwin-arm64': {
      url: 'https://github.com/corvo007/cpp-ctc-aligner/releases/latest/download/cpp-ort-aligner-macos-universal2.tar.gz',
      type: 'tar.gz',
      extractAll: true,
    },
  },
};

// Files that should be kept in the repository (not downloaded)
export const KEEP_FILES = [
  'icon.png',
  'editor.png',
  'editor_en.png',
  'Chinese_to_Pinyin.txt',
  'ggml-silero-v6.2.0.bin',
  'fonts',
];

// Expected output files per platform (for verification)
export const EXPECTED_FILES = {
  'win32-x64': [
    'ffmpeg.exe',
    'ffprobe.exe',
    'yt-dlp.exe',
    'qjs.exe',
    'whisper-cli.exe',
    'cpp-ort-aligner.exe',
    'onnxruntime.dll',
  ],
  'linux-x64': ['ffmpeg', 'ffprobe', 'yt-dlp', 'qjs', 'whisper-cli', 'cpp-ort-aligner', 'libonnxruntime.so'],
  'linux-arm64': ['ffmpeg', 'ffprobe', 'yt-dlp', 'qjs', 'whisper-cli', 'cpp-ort-aligner', 'libonnxruntime.so'],
  'darwin-x64': ['ffmpeg', 'ffprobe', 'yt-dlp', 'qjs', 'whisper-cli', 'cpp-ort-aligner', 'libonnxruntime.dylib'],
  'darwin-arm64': ['ffmpeg', 'ffprobe', 'yt-dlp', 'qjs', 'whisper-cli', 'cpp-ort-aligner', 'libonnxruntime.dylib'],
};

// Files required for each binary (used for skip logic with extractAll)
export const REQUIRED_FILES = {
  'cpp-ort-aligner': {
    'win32-x64': ['cpp-ort-aligner.exe', 'onnxruntime.dll'],
    'linux-x64': ['cpp-ort-aligner', 'libonnxruntime.so'],
    'linux-arm64': ['cpp-ort-aligner', 'libonnxruntime.so'],
    'darwin-x64': ['cpp-ort-aligner', 'libonnxruntime.dylib'],
    'darwin-arm64': ['cpp-ort-aligner', 'libonnxruntime.dylib'],
  },
};