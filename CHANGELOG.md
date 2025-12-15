# Changelog

All notable changes to this project will be documented in this file.

## [2.9.3] - 2025-12-16

### Features

- **Speaker Analysis**: Enhanced speaker analysis and synchronized settings for better diarization control.

### Fixes

- **End-to-End**: Resolved critical infinite loop in `useEndToEndSubtitleGeneration` hook.
- **Robustness**: Improved JSON parsing reliability and error logging.

### Refactor

- **Cleanup**: Repository structure cleanup (Phases 1-2, 5, 7, 9).

### Documentation

- **Architecture**: Updated diagrams for the End-to-End pipeline.

## [2.9.2] - 2025-12-15

### Features

- **End-to-End Pipeline**: Auto-advance after successful parsing, persist auto-confirmed glossary terms.
- **UI Architecture**: Implemented new reusable UI components and unified page layouts.
- **Electron**: Added context menu support.

### Fixes

- **End-to-End**: Fixed double-click requirement for starting Full Auto mode.

### Refactor

- **UI Migration**: Migrated pages, modals, and settings to new layout and component primitives.
- **Prompts**: Enforced strict segment boundaries and improved timestamp verification rules.
- **Codebase**: Unified glossary logic and improved variable naming (`enableDiarization`).

## [2.9.1] - 2025-12-14

### Features

- **Speaker Diarization**: Added `minSpeakers`/`maxSpeakers` hints for improved LLM diarization accuracy.
- **End-to-End Pipeline**: Enhanced input parsing and pipeline handling.

### Fixes

- **YouTube**: Improved URL parsing to correctly handle playlist links.

### Refactor

- **Path Aliases**: Replaced relative imports with absolute aliases (`@/`, `@electron/`) throughout codebase.
- **UI**: Refined `StepConfig` and `CustomSelect` component styling.

### Documentation

- **Architecture**: Updated project architecture documentation.

## [2.9.0] - 2025-12-14

### Features

- **Full Auto Mode**: Implemented complete End-to-End pipeline with new wizard UI (`EndToEndWizard`), core service (`EndToEndPipelineService`), and main process integration.
- **Security**: Implemented high-risk security fixes based on Electron best practices audit.
- **Error Handling**: Added graceful warning for thumbnail download failures.

### Fixes

- **Core**: Miscellaneous improvements to audio decoding, timing accuracy, and UI stability.
- **Build**: Fixed `ytdlp` compilation issues.

### Documentation

- **Guides**: Added documentation for Full Auto / End-to-End mode.

## [2.8.5] - 2025-12-12

### Features

- **Translation Prompts**: Added context-aware translation instructions and tuned Conservative Mode for better timing adherence (0.5s threshold).

### Refactor

- **UI**: Removed redundant StatusBadge and improved toolbar responsiveness.
- **Validation**: Adjusted subtitle validation duration thresholds.

## [2.8.4] - 2025-12-11

### Features

- **HiDPI Support**: Added optimizations for high pixel density screens (Retina/4K), including compact spacing and refined layout.
- **Fluid Typography**: Implemented viewport-aware font scaling for better readability across different screen sizes.
- **Prompt Engineering**: Improved translation prompts with "Visual Balance" checks and better filler word removal.
- **Hardware Acceleration**: Enhanced GPU encoder detection by verifying encoding capability with test frames.

## [2.8.3] - 2025-12-11

### Features

- **Hardware Acceleration**: Added hardware acceleration support for video encoding.
- **File Handling**: Improved file handling in Electron main process.

## [2.8.2] - 2025-12-10

### Features

- **Responsive Layout**: Optimized responsive layout and window size limits for better UX.

## [2.8.1] - 2025-12-09

### Refactor

- **Subtitle IDs**: Migrated from numeric to string-based IDs to fix AI re-indexing bugs.

### Performance

- **Token Efficiency**: Optimized subtitle ID length to 4 characters for better LLM token usage.

## [2.8.0] - 2025-12-09

### Features

- **Unified Snapshots**: Implemented a unified persistent snapshot system for better history management.
- **UI Redesign**: Redesigned `BatchHeader` with improved responsive layout and aesthetics.

## [2.7.3] - 2025-12-09

### Refactor

- **Model Names**: Unified model names across the codebase and auto-fixed unused imports.
- **Hooks Architecture**: Split `useWorkspaceLogic` into 4 smaller focused hooks for better maintainability.
- **Environment Variables**: Centralized env vars configuration.

### Chore

- **Code Quality**: Added Prettier + ESLint with pre-commit hooks.

## [2.7.2] - 2025-12-06

### Features

- **Batch Operations**: Enhanced `BatchHeader` with improved bulk editing and speaker assignment.
- **Speaker Manager**: Added batch speaker assignment and improved merge workflow.

### Fixes

- **Subtitle Editor**: Improved row selection and keyboard navigation.
- **Workspace Logic**: Enhanced state management and undo/redo handling.

## [2.7.1] - 2025-12-06

### Performance

- **Virtualized Subtitle List**: Optimized large file rendering using `react-virtuoso` for virtualized subtitle lists.

### Fixes

- **UI Improvements**: Minor UI fixes and refinements.

## [2.7.0] - 2025-12-06

### Features

- **Speaker Management**: New speaker manager modal with rename, delete, and merge functionality. Added `SpeakerSelect` component for easy speaker assignment in subtitle editor.
- **About Modal**: New about dialog displaying version info and project credits.
- **Enhanced Logging**: Added `MainLogger` for Electron main process with file persistence and IPC broadcasting.
- **Editor Improvements**: Enhanced `SubtitleEditor`, `SubtitleRow`, and `BatchHeader` with better speaker handling and UI.
- **File Upload**: Improved `FileUploader` with better drag-and-drop and file validation.

### Fixes

- **Whisper Service**: Enhanced error handling and response parsing.
- **Subtitle Parser/Generator**: Improved speaker tag handling in SRT/ASS formats.
- **Gemini Client**: Better retry logic and error recovery.

### Performance

- **Batch Processing**: Optimized batch translation with improved concurrency.
- **Workspace Logic**: Streamlined state management in `useWorkspaceLogic`.

## [2.6.0] - 2025-12-05

### Features

- **Video Compression**: Built-in FFmpeg engine supporting H.264/H.265 encoding, CRF quality control, resolution adjustment, and subtitle hardcoding.
- **Video Download**: Integrated yt-dlp for downloading videos from YouTube and Bilibili.
- **Workspace History**: New history panel showing session snapshots and persistent project history.
- **UI Improvements**: Enhanced dropdown menus to open upwards when near the screen bottom.

### Fixes

- **Compression**: Fixed error handling for `isStream` during compression.
- **UI**: Fixed CRF input field to support decimal values.
- **UI**: Fixed `CustomSelect` dropdown positioning.

### Performance

- **Gemini API**: Optimized client error handling and retry logic.
