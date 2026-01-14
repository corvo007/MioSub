# Project Context

## Purpose

Gemini Subtitle Pro is an AI-powered subtitle creation, translation, and polishing tool. It uses Google Gemini models for translation/refinement and OpenAI Whisper for speech transcription.

## Tech Stack

- React 19 with TypeScript 5.8
- Vite 6 (build tool)
- Electron 39 (desktop app)
- TailwindCSS 4 (styling)
- Google Gemini API (translation/polishing)
- OpenAI Whisper (speech transcription)
- whisper.cpp (local transcription)
- ffmpeg (audio/video processing)
- yt-dlp (video downloading)

## Project Conventions

### Code Style

- Path aliases mandatory: `@/*`, `@components/*`, `@hooks/*`, `@services/*`, `@utils/*`, `@types/*`, `@lib/*`, `@electron/*`
- Avoid relative paths across directories (no `../../`)
- TailwindCSS 4 with `clsx` and `tw-merge` for styling
- Component-specific utils stay co-located with the component
- React Context for global state (e.g., `useWorkspaceLogic`)

### Architecture Patterns

- **Dual-Stack Structure**: Single codebase supports both Web and Desktop (Electron)
  - `src/` - Web/Renderer code (React, UI, services)
  - `electron/` - Desktop-only code (Node.js main process)
- **IPC Contract**: Handlers in `main.ts`, bridge in `preload.ts`, types in `electron.d.ts`
- **Channel naming**: `feature:action` (e.g., `video:compress`)
- **Concurrency Model**: Dual Semaphores for transcription and refinement
  - `transcriptionSemaphore`: Controls Whisper API calls (local: 1, cloud: 5)
  - `refinementSemaphore`: Controls Gemini Flash API (default: 5)

### Testing Strategy

- Lint configured via `lint-staged`, runs automatically on git commit
- No standalone lint or test scripts defined
- Manual verification via `yarn dev` (web) or `yarn electron:dev` (desktop)

### Git Workflow

- Do NOT commit changes automatically
- Wait for user verification before running `git commit`
- Package manager: Yarn (check `yarn.lock` exists; avoid `package-lock.json`)

## Domain Context

- **Subtitle formats**: SRT, ASS, VTT parsing and generation
- **Generation Pipeline**: Orchestrates transcription → glossary → speaker → translation
- **VAD (Voice Activity Detection)**: Used for audio segmentation
- **Chunks**: Audio segments processed with `mapInParallel`, each waiting for glossary and speaker profile extraction before refinement

## Important Constraints

- **Electron Security**: Must maintain in `BrowserWindow`:
  - `nodeIntegration: false`
  - `contextIsolation: true`
  - `sandbox: true`
- **Protocol**: `local-video://` custom protocol for streaming video files (supports tailing for in-progress transcodes)

## External Dependencies

- **Google Gemini API**: Required for translation/polishing (`GEMINI_API_KEY`)
- **OpenAI API**: Required for cloud Whisper transcription (`OPENAI_API_KEY`)
- **Native binaries**: ffmpeg, whisper.cpp, yt-dlp (in `resources/`)
