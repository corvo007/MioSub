# Changelog

All notable changes to this project will be documented in this file.

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
