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

## Analytics & Monitoring

This section contains all analytics and monitoring configuration, query guidelines, and investigation workflows for MioSub.

### Platform Configuration

#### Sentry (Error Tracking)

- **Organization**: `corvo007`
- **Production Project**: `miosub` (use this for issue analysis)
- **Test Project**: `miosub-test` (ignore, for development only)

#### Amplitude (Product Analytics)

- **Organization**: `frosty-water-275285`
- **Production Project**: `miosub-3.0` (appId: `781359`)
- **Legacy Project**: `miosub` (appId: `777663`, deprecated)

#### Mixpanel (Product Analytics)

- **Production Project**: `miosub` (project_id: `3985897`)
- **Dev Project**: `miosub-dev` (project_id: `3981231`, ignore)

When analyzing issues or statistics, always use the production projects (`miosub` for Sentry/Mixpanel, `miosub-3.0` for Amplitude).

### Analytics Events Reference

See **[docs/analytics-events.md](docs/analytics-events.md)** for a complete list of tracked events and their properties. This document is auto-generated by `yarn docs:analytics`.

Use this reference when:

- Investigating Sentry issues to find related user actions
- Building Amplitude/Mixpanel queries to understand user behavior
- Adding new tracking events (to maintain consistency)

### Analytics Query Guidelines

**DO NOT use AI/natural language query services** provided by analytics platforms:

- ❌ `analyze_issue_with_seer` - Sentry AI analysis (requires paid plan)
- ❌ Any other AI-assisted query features from analytics platforms

**Reasons**:

1. AI queries lose original information - you receive second-hand, potentially incomplete data
2. These features often require paid plans or have limited quotas
3. Claude is a powerful AI capable of analyzing raw data directly

#### Sentry Query Strategy

| Tool                   | Use For                                               | Limitation                                         |
| ---------------------- | ----------------------------------------------------- | -------------------------------------------------- |
| `search_issues`        | Get issue list and IDs only                           | Uses `naturalLanguageQuery`, results are summaries |
| `search_events`        | Get event counts and IDs only                         | Uses `naturalLanguageQuery`, results are summaries |
| `get_issue_details`    | **Deep analysis** - full stacktrace, tags, context    | Structured, use this for investigation             |
| `get_issue_tag_values` | **Distribution analysis** - user/browser/os breakdown | Structured, use for pattern analysis               |
| `get_trace_details`    | **Trace correlation** - find related events           | Structured, use for causation analysis             |

#### Correct Workflow

1. Use `search_issues` to get issue IDs (keep query simple, e.g., "unresolved issues")
2. Use `get_issue_details` for each issue to get full context
3. Use `get_issue_tag_values` to analyze patterns (user distribution, environment, etc.)
4. Cross-reference with Amplitude/Mixpanel using `query_dataset`, `run_segmentation_query`

#### Cross-Platform Data Validation

**IMPORTANT: Always cross-validate data between Amplitude and Mixpanel.**

Single platform data may be incomplete due to:

- Network failures during event transmission
- Client-side SDK initialization timing issues
- Ad blockers or privacy extensions blocking specific tracking domains
- Platform-specific rate limiting or data sampling

**Best Practice**:

- Query the same event/user in both Amplitude and Mixpanel
- If data differs, use the platform with more complete data as primary source
- Document discrepancies in investigation notes
- Never conclude based on "no data found" from a single platform

### Sentry Issue Investigation Workflow

Investigation records are maintained in a **separate git repository**:

- **Local path**: `docs/sentry-investigations/` (gitignored from main repo)
- **Remote**: `https://github.com/corvo007/sentry-investigations.git`

**After creating/updating investigation files, always commit and push:**

```bash
cd docs/sentry-investigations
git add -A
git commit -m "investigate: MIOSUB-X [brief description]"
git push
```

#### 1. Triage New Issues

```
1. Get latest issues: search_issues("unresolved issues from last 7 days")
2. Check README.md index - is this a known issue or duplicate?
3. If new: create MIOSUB-X.md from template
4. If duplicate: update existing file with new event data
```

#### 2. Investigation Process

```
1. Get full details: get_issue_details(issueId)
2. Analyze patterns: get_issue_tag_values(issueId, "user"), etc.
3. ⚠️ VERSION CHECK: Before analyzing ANY code path, verify it existed
   at the crash version using: git show <release-tag>:<file>
   NEVER reason about HEAD code for older version crashes.
4. Check for related issues (same user, same trace_id)
5. Review docs/analytics-events.md for relevant tracking fields
   - Check if user actions before error were tracked
   - Look for related events (e.g., generation_started before generation_failed)
   - Use Amplitude/Mixpanel to query these events for the affected user
6. Cross-reference with Amplitude/Mixpanel
7. Document in issue file:
   - Initial hypothesis
   - Investigation steps
   - Intermediate conclusions
   - Final conclusion
```

#### ⚠️ CRITICAL: Documentation Rules

**Investigation records are append-only. NEVER delete or overwrite previous analysis.**

1. **Conclusions can only be ADDED, never deleted**
   - Keep initial hypothesis even if proven wrong
   - Keep intermediate conclusions even if superseded
   - Add new conclusions with updated evidence

2. **Every conclusion MUST have a complete evidence chain**
   - What query was executed (tool name + parameters)
   - What data was returned (raw results)
   - How the data supports the conclusion
   - Example:
     ```
     Query: mcp__mixpanel__run_segmentation_query(
       project_id: 3985897,
       event: "end_to_end_generation_started",
       where: 'properties["$user_id"] == "xxx"'
     )
     Result: {"values": {"true": {"2026-02-01": 2}}}
     Conclusion: User was using third-party API (is_third_party_gemini=true)
     ```

3. **Document the reasoning process, not just the result**
   - Why did you check this data source?
   - What alternatives were considered?
   - Why were they ruled out?

4. **ALWAYS verify code at crash version before reasoning about code paths**
   - Use `git show <release-tag>:<file>` to see actual code at the crash version
   - NEVER analyze HEAD code and assume it existed in older versions
   - When a log is "missing", first check: did the code producing that log exist at the crash version?
   - This prevents wasting hours investigating false hypotheses based on code that wasn't deployed yet

#### 3. After Fix Applied

```
1. Update issue file: Status → "✅ Fixed (pending vX.X.X)"
2. Update README.md:
   - Version Fix Tracking table
   - Quick Stats
3. If cascade error: note which upstream fix resolves it
```

#### 4. Before Release

```
1. Review all "✅ Fixed (pending)" issues
2. Update status → "🚀 Released in vX.X.X"
3. Update Version Fix Tracking table with release date
4. Close issues in Sentry: update_issue(issueId, status="resolved")
```

#### 5. After Release (Monitoring)

```
1. Check if fixed issues reoccur → mark as "🔄 Regressed"
2. Update Regression Tracking table
3. Investigate regression cause
```

#### Issue File Template

```markdown
# MIOSUB-X: [Title]

**URL**: https://corvo007.sentry.io/issues/MIOSUB-X
**Status**: [❌ Open | ✅ Fixed | 🚀 Released | ⏭️ Won't Fix | ⬆️ Upstream]
**Priority**: [P0-P3]
**Events**: X | **Users**: X

## Related Issues

| Relation | Issue | Description |
| -------- | ----- | ----------- |

## Event Breakdown

[Fine-grained breakdown - same issue can have different causes]

## Investigation

### Initial Hypothesis

### Investigation Steps

### Final Conclusion

## Fix Applied / Recommended Fix
```

## Development Principles

- **Don't reinvent the wheel**: Use mature third-party libraries when available (e.g., use existing libraries for JSON parsing, never write your own parser). Leverage capabilities already provided by browsers and the OS (e.g., file downloads, file pickers) instead of reimplementing them in-app.
- **Keep non-core features simple**: Don't over-engineer peripheral functionality. MioSub's core value is the subtitle generation pipeline — auxiliary features (e.g., model downloads, file management) should use minimal implementation. They are not worth significant engineering investment.
- **Prefer user's existing tools**: For example, for model file distribution, provide download links + a file picker. Don't build a custom download manager — the user's browser already handles downloads with resume, proxy support, and retry.

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
