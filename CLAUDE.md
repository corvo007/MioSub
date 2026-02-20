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

### Nested Independent Repos

Two directories are **separate git repositories** (gitignored from the main repo):

| Directory                     | Remote                           | Purpose                                                  |
| ----------------------------- | -------------------------------- | -------------------------------------------------------- |
| `.claude/skills/`             | `corvo007/claude-code-skills`    | Reusable AI skill definitions (portable across projects) |
| `docs/sentry-investigations/` | `corvo007/sentry-investigations` | Append-only investigation logs and periodic reports      |

When committing changes in these directories, `cd` into them and use their own `git add/commit/push` — commits to the main repo won't include their contents.

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

## Analytics & Monitoring

Detailed rules are in `.claude/rules/`:

- **`.claude/rules/analytics.md`** — Platform config (Sentry/Amplitude/Mixpanel), query guidelines, cross-platform validation
- **`.claude/rules/sentry-investigation.md`** — Investigation workflow, documentation rules, issue template
- **`.claude/rules/electron.md`** — Security rules, IPC contract, protocols (scoped to `electron/**`)

## Planned Work

See **[docs/plans/README.md](docs/plans/README.md)** for the full index of pending, completed, and archived plans.

## Development Principles

- **Don't reinvent the wheel**: Use mature third-party libraries when available (e.g., use existing libraries for JSON parsing, never write your own parser). Leverage capabilities already provided by browsers and the OS (e.g., file downloads, file pickers) instead of reimplementing them in-app.
- **Keep non-core features simple**: Don't over-engineer peripheral functionality. MioSub's core value is the subtitle generation pipeline — auxiliary features (e.g., model downloads, file management) should use minimal implementation. They are not worth significant engineering investment.
- **Prefer user's existing tools**: For example, for model file distribution, provide download links + a file picker. Don't build a custom download manager — the user's browser already handles downloads with resume, proxy support, and retry.
- **Never mask errors — fix root causes**: Do not wrap errors in silent fallbacks or swallow exceptions to make symptoms disappear. When an error occurs: (1) investigate WHY the data is wrong, not how to tolerate wrong data; (2) verify the root cause with real evidence (e.g., `curl` the API, `git show` the code at crash version); (3) fix the actual cause; (4) verify the fix resolves the original error. A `try/catch` that returns a default value is not a fix — it's a cover-up.

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
