---
title: 'Project Architecture'
---

MioSub is a desktop application built with Electron + React + TypeScript, focused on AI-powered video subtitle generation, translation, and polishing.

## 📖 Tech Stack

- **Frontend**: React 18 + TypeScript
- **Desktop**: Electron
- **Build Tool**: Vite
- **AI Services**: Google Gemini API, OpenAI Whisper API
- **Media Processing**: FFmpeg, whisper.cpp

## 🏗️ Project Structure

```
├── electron/          # Electron main process
│   ├── main.ts        # Main process entry
│   ├── preload.ts     # Preload script
│   └── services/      # Backend services (translation, transcription, etc.)
├── src/               # React renderer process
│   ├── components/    # UI components
│   ├── hooks/         # React Hooks
│   ├── stores/        # State management
│   └── types/         # TypeScript type definitions
└── resources/         # Static assets
```

## 🔄 Core Pipeline

1. **Video Download** → yt-dlp fetches video
2. **Audio Extraction** → FFmpeg extracts audio
3. **Speech Transcription** → Whisper API / whisper.cpp
4. **AI Translation** → Gemini context-aware translation
5. **Timeline Alignment** → CTC forced alignment (optional)
6. **Subtitle Encoding** → FFmpeg burns hardcoded subtitles

---

> 📖 Detailed architecture documentation coming soon...
