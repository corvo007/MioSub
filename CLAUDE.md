<!-- OPENSPEC:START -->

# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:

- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:

- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MioSub** is an AI-powered subtitle creation, translation, and polishing tool. It uses Google Gemini models for translation/refinement and OpenAI Whisper for speech transcription.

- **Tech Stack**: React 19, Vite 6, Electron 39, TypeScript 5.8, TailwindCSS 4
- **Dual Platform**: Single codebase supports both Web and Desktop (Electron)
- **Package Manager**: Yarn (check `yarn.lock` exists; avoid `package-lock.json`)

## Development Commands

```bash
# Install dependencies
yarn install

# Web development (Vite dev server)
yarn dev

# Electron development (full desktop app with hot reload)
yarn electron:dev

# Build web (Vite production build)
yarn build

# Build Electron main process only
yarn build:main

# Build distributable desktop app (main + web + electron-builder)
yarn electron:build

# Debug desktop build (with DEBUG_BUILD=true)
yarn build:debug

# Preview web production build
yarn preview

# Extract i18n strings from source
yarn i18n:extract

# Check i18n completeness
yarn i18n:check

# Format code with Prettier
yarn format

# Setup git hooks (runs automatically on yarn install)
yarn prepare
```

**Note**: Lint is configured via `lint-staged` and runs automatically on git commit. No standalone lint or test scripts are defined.

## Architecture

### Dual-Stack Structure (NOT a monorepo)

```
src/                  # Web/Renderer code (React, UI, services)
  ├── components/     # React components
  ├── hooks/          # React hooks (useWorkspaceLogic is core)
  ├── services/       # Business logic (API, audio, subtitle, generation)
  ├── types/          # TypeScript definitions
  ├── locales/        # i18n resources (zh-CN, en-US)
  └── workers/        # Web Workers (VAD, parser)

electron/             # Desktop-only code (Node.js main process)
  ├── main.ts         # Main process entry
  ├── preload.ts      # IPC bridge (contextBridge)
  └── services/       # Native services (ffmpeg, whisper, yt-dlp)
```

### Path Aliases (mandatory)

Use path aliases instead of relative paths (`../../`):

- `@/*` → `src/*`
- `@components/*` → `src/components/*`
- `@hooks/*` → `src/hooks/*`
- `@services/*` → `src/services/*`
- `@utils/*` → `src/utils/*`
- `@types/*` → `src/types/*`
- `@lib/*` → `src/lib/*`
- `@electron/*` → `electron/*`

### Key Services

| Service             | Location                                      | Purpose                                                       |
| ------------------- | --------------------------------------------- | ------------------------------------------------------------- |
| Generation Pipeline | `src/services/generation/pipeline/`           | Orchestrates transcription → glossary → speaker → translation |
| Gemini API          | `src/services/api/gemini/core/`               | Client, prompts, schemas for Google AI                        |
| Audio Processing    | `src/services/audio/`                         | VAD segmentation, sampling, decoding                          |
| Subtitle Parsing    | `src/services/subtitle/`                      | SRT/ASS/VTT parsing and generation                            |
| Local Whisper       | `electron/services/localWhisper.ts`           | whisper.cpp integration                                       |
| Video Preview       | `electron/services/videoPreviewTranscoder.ts` | fMP4 transcoding with caching                                 |

### Concurrency Model

The pipeline uses dual Semaphores:

- `transcriptionSemaphore`: Controls Whisper API calls (local: 1, cloud: 5)
- `refinementSemaphore`: Controls Gemini Flash API (default: 5)

Chunks are processed with `mapInParallel`, with each chunk waiting for glossary and speaker profile extraction before refinement.

## Electron Security Rules

**MUST maintain these settings** in `electron/main.ts` `BrowserWindow`:

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`

### IPC Contract

- IPC handlers: `electron/main.ts` (`ipcMain.handle/on`)
- Preload bridge: `electron/preload.ts` (`contextBridge.exposeInMainWorld`)
- Renderer types: `src/types/electron.d.ts`

When adding new IPC channels:

1. Add handler in `main.ts`
2. Expose in `preload.ts`
3. Update types in `electron.d.ts`
4. Use naming convention: `feature:action` (e.g., `video:compress`)

### Protocols

- `local-video://` - Custom protocol for streaming video files (supports tailing for in-progress transcodes)

## Change Impact Assessment

| Scope        | What to check                                        |
| ------------ | ---------------------------------------------------- |
| Web only     | `src/`, `vite.config.ts`                             |
| Desktop only | `electron/`, `vite.config.electron.ts`               |
| Both         | IPC contract, shared types/config/services, env vars |

## Verification Commands

| Change Type  | Verify With                                             |
| ------------ | ------------------------------------------------------- |
| UI/Web logic | `yarn dev`                                              |
| IPC/Preload  | `yarn electron:dev`                                     |
| Main process | `yarn electron:dev` (or `yarn build:main` for bundling) |
| Build config | `yarn build` (Web) / `yarn electron:build` (Desktop)    |

## Environment Variables

Create `.env.local` from `.env.example`:

```env
GEMINI_API_KEY=your_key    # Required for translation/polishing
OPENAI_API_KEY=your_key    # Required for cloud Whisper transcription
```

Web: Variables are injected via Vite `define` in `vite.config.ts`.

## Code Style

- **Imports**: Path aliases mandatory; avoid relative paths across directories
- **Co-location**: Component-specific utils stay with the component
- **Styling**: TailwindCSS 4 with `clsx` and `tw-merge`
- **State**: React Context for global state (e.g., `useWorkspaceLogic`)

## Git Workflow

- **Do NOT commit changes automatically**. Wait for user to verify the changes and give explicit commit instructions before running `git commit`.

## Directories to Avoid Modifying

- `dist/`, `dist-electron/`, `release/` - Build outputs
- `node_modules/` - Dependencies
- `resources/*.exe`, `resources/*.dll` - Native binaries
