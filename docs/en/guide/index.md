# Getting Started

We provide pre-built installers, ready to use without any development setup.

## 1️⃣ Download & Install

1. Visit the [Releases](https://github.com/corvo007/Gemini-Subtitle-Pro/releases) page
2. Download: `Gemini-Subtitle-Pro-x.x.x-win-x64.zip`
3. Extract anywhere and run `MioSub.exe`

## 2️⃣ Configure API Key

Open Settings and enter your Gemini and OpenAI API Keys.

::: warning Important Notes

1. For local Whisper, see [Local Whisper Setup](./whisper)
2. API Key must support **Gemini 3 Flash**, **Gemini 3 Pro**, and **Gemini 2.5 Flash**
3. Custom models not supported to ensure translation quality
   :::

## 3️⃣ Start Using

Enjoy! 🎉

---

## 🧠 Technical Details

### 🎧 Auto Glossary Extraction

- Smart extraction of proper nouns (names, places, titles)
- Google Search verification for standard translations
- Generate glossary for consistent terminology

### ⚡ Long Context Translation

- Semantic segmentation into 5-10 minute chunks
- Full context preservation to avoid fragmentation
- Scene presets (anime, movie, news, tech) for style optimization

### 🗣️ Speaker Recognition

- Auto-detect and label multiple speakers
- Customizable speaker names and colors
- Merge adjacent same-speaker subtitles

### 🚀 Fully Automated Mode

Just paste a video link (YouTube/Bilibili):

1. **Auto Download**: yt-dlp downloads best quality
2. **Audio Extraction**: Extract audio with VAD segmentation
3. **Smart Transcription**: Whisper speech-to-text
4. **AI Translation**: Gemini context-aware translation
5. **Auto Encode**: FFmpeg burns subtitles (GPU accelerated)
6. **Output**: Ready MP4 with hardcoded subtitles
