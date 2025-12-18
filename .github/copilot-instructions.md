# Gemini Subtitle Pro Copilot Instructions

## Architecture Overview

This is a hybrid **Electron + Web (Vite)** application for AI-powered subtitle generation.

- **`src/`**: Web renderer code (React 19, TailwindCSS 4, Vite 6).
- **`electron/`**: Main process code (Node.js, native integrations).
- **`src/services/`**: Core business logic separate from UI.
- **`resources/`**: Native binaries (ffmpeg, whisper, yt-dlp).

## Critical Rules

1. **Read First**: Always read the file context before editing.
2. **Small Edits**: Keep changes <50 lines per verification cycle.
3. **No Relative Imports**: Use aliases (`@/` -> `src/`, `@electron/` -> `electron/`).
4. **Co-location**: Utils specific to a component stay with that component.

## Tech Stack & Patterns

- **State**: React Context for global state (e.g., `useWorkspaceLogic`).
- **Styling**: TailwindCSS 4 (Utility-first). Use `clsx` and `tw-merge` for conditional classes.
- **Async**: Heavy use of `Promise` concurrency (Semaphores) for processing chunks.
- **IPC**: Electron IPC via `preload.ts` for heavy tasks (download, compress).

## Key Workflows

- **Dev**: `npm run dev` (Web only), `npm run electron:dev` (Full app).
- **Build**: `npm run build` (Web), `npm run electron:build` (Distributable).
- **Lint**: `npm run lint` (ESLint + Prettier).

## Specific Context

- **AI Integration**: Uses Google GenAI SDK (Gemini) and OpenAI SDK (Whisper).
- **File Structure**: `src/components/pages/WorkspacePage.tsx` is the main editor.
- **Audio**: `src/services/audio` handles VAD and segmentation.

## Common Tasks

- **New Component**: Place in `src/components/ui` or feature folder. Use `fc` snippet.
- **API Change**: Update `src/services/api` AND `electron/services` if native.
- **Database**: Local storage + JSON file persistence (no SQL).
