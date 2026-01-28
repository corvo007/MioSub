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
      url: 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.3/whisper-bin-x64.zip',
      type: 'zip',
      extract: [
        { from: 'whisper-cli.exe', to: 'whisper-cli.exe' },
        { from: 'whisper.dll', to: 'whisper.dll' },
        { from: 'ggml.dll', to: 'ggml.dll' },
        { from: 'ggml-base.dll', to: 'ggml-base.dll' },
        { from: 'ggml-cpu.dll', to: 'ggml-cpu.dll' },
        { from: 'SDL2.dll', to: 'SDL2.dll' },
      ],
    },
    'linux-x64': {
      url: 'https://github.com/corvo007/whisper.cpp/releases/download/v1.8.3-custom/whisper-v1.8.3-linux-x86_64.tar.gz',
      type: 'tar.gz',
      extract: [{ from: 'whisper-cli', to: 'whisper-cli' }],
    },
    'linux-arm64': {
      url: 'https://github.com/corvo007/whisper.cpp/releases/download/v1.8.3-custom/whisper-v1.8.3-linux-arm64.tar.gz',
      type: 'tar.gz',
      extract: [{ from: 'whisper-cli', to: 'whisper-cli' }],
    },
    'darwin-x64': {
      url: 'https://github.com/corvo007/whisper.cpp/releases/download/v1.8.3-custom/whisper-v1.8.3-macos-x86_64.tar.gz',
      type: 'tar.gz',
      extract: [{ from: 'whisper-cli', to: 'whisper-cli' }],
    },
    'darwin-arm64': {
      url: 'https://github.com/corvo007/whisper.cpp/releases/download/v1.8.3-custom/whisper-v1.8.3-macos-arm64.tar.gz',
      type: 'tar.gz',
      extract: [{ from: 'whisper-cli', to: 'whisper-cli' }],
    },
  },

  'cpp-ort-aligner': {
    'win32-x64': {
      url: 'https://github.com/corvo007/cpp-ctc-aligner/releases/latest/download/cpp-ort-aligner-windows-x64-v0.1.2.zip',
      type: 'zip',
      extract: [
        { from: 'cpp-ort-aligner.exe', to: 'cpp-ort-aligner.exe' },
        { from: 'onnxruntime.dll', to: 'onnxruntime.dll' },
        { from: 'Chinese_to_Pinyin.txt', to: 'Chinese_to_Pinyin.txt' },
      ],
    },
    'linux-x64': {
      url: 'https://github.com/corvo007/cpp-ctc-aligner/releases/latest/download/cpp-ort-aligner-linux-x64-v0.1.2.tar.gz',
      type: 'tar.gz',
      extract: [
        { from: 'cpp-ort-aligner', to: 'cpp-ort-aligner' },
        { from: 'Chinese_to_Pinyin.txt', to: 'Chinese_to_Pinyin.txt' },
      ],
    },
    'linux-arm64': {
      url: 'https://github.com/corvo007/cpp-ctc-aligner/releases/latest/download/cpp-ort-aligner-linux-arm64-v0.1.2.tar.gz',
      type: 'tar.gz',
      extract: [
        { from: 'cpp-ort-aligner', to: 'cpp-ort-aligner' },
        { from: 'Chinese_to_Pinyin.txt', to: 'Chinese_to_Pinyin.txt' },
      ],
    },
    'darwin-x64': {
      url: 'https://github.com/corvo007/cpp-ctc-aligner/releases/latest/download/cpp-ort-aligner-macos-universal2-v0.1.2.tar.gz',
      type: 'tar.gz',
      extract: [
        { from: 'cpp-ort-aligner', to: 'cpp-ort-aligner' },
        { from: 'Chinese_to_Pinyin.txt', to: 'Chinese_to_Pinyin.txt' },
      ],
    },
    'darwin-arm64': {
      url: 'https://github.com/corvo007/cpp-ctc-aligner/releases/latest/download/cpp-ort-aligner-macos-universal2-v0.1.2.tar.gz',
      type: 'tar.gz',
      extract: [
        { from: 'cpp-ort-aligner', to: 'cpp-ort-aligner' },
        { from: 'Chinese_to_Pinyin.txt', to: 'Chinese_to_Pinyin.txt' },
      ],
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
    'whisper.dll',
    'ggml.dll',
    'ggml-base.dll',
    'ggml-cpu.dll',
    'SDL2.dll',
    'cpp-ort-aligner.exe',
  ],
  'linux-x64': ['ffmpeg', 'ffprobe', 'yt-dlp', 'qjs', 'whisper-cli', 'cpp-ort-aligner'],
  'linux-arm64': ['ffmpeg', 'ffprobe', 'yt-dlp', 'qjs', 'whisper-cli', 'cpp-ort-aligner'],
  'darwin-x64': ['ffmpeg', 'ffprobe', 'yt-dlp', 'qjs', 'whisper-cli', 'cpp-ort-aligner'],
  'darwin-arm64': ['ffmpeg', 'ffprobe', 'yt-dlp', 'qjs', 'whisper-cli', 'cpp-ort-aligner'],
};