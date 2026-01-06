---
name: electron-dev
description: Electron main process and IPC development guidelines for Gemini-Subtitle-Pro. Use when working with IPC handlers, preload scripts, native integrations (ffmpeg, whisper, yt-dlp), file system operations, and desktop-specific features. Covers security requirements, IPC patterns, and cross-process communication.
---

# Electron Development Guidelines

## Purpose

Establish secure and consistent patterns for Electron main process development in Gemini-Subtitle-Pro.

## When to Use This Skill

Automatically activates when working on:

- Creating or modifying IPC handlers
- Working with preload scripts
- Native integrations (ffmpeg, whisper, yt-dlp)
- File system operations
- Desktop-specific features
- Protocol handlers

---

## Quick Start

### New IPC Channel Checklist

- [ ] **Handler**: Add in `electron/main.ts` using `ipcMain.handle()`
- [ ] **Bridge**: Expose in `electron/preload.ts` via `contextBridge`
- [ ] **Types**: Update `src/types/electron.d.ts`
- [ ] **Naming**: Use `feature:action` convention

---

## Security Requirements (CRITICAL)

**These settings MUST be maintained in `electron/main.ts`:**

```typescript
const mainWindow = new BrowserWindow({
  webPreferences: {
    nodeIntegration: false, // NEVER change to true
    contextIsolation: true, // NEVER change to false
    sandbox: true, // NEVER change to false
    preload: path.join(__dirname, 'preload.js'),
  },
});
```

**Why?**

- `nodeIntegration: false` - Prevents renderer from accessing Node.js APIs directly
- `contextIsolation: true` - Separates preload from renderer context
- `sandbox: true` - Limits preload script capabilities

---

## IPC Contract Pattern

### Step 1: Handler in main.ts

```typescript
// electron/main.ts
ipcMain.handle('video:compress', async (event, options: CompressOptions) => {
  try {
    const result = await compressVideo(options);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
```

### Step 2: Bridge in preload.ts

```typescript
// electron/preload.ts
contextBridge.exposeInMainWorld('electronAPI', {
  compressVideo: (options: CompressOptions) => ipcRenderer.invoke('video:compress', options),
});
```

### Step 3: Types in electron.d.ts

```typescript
// src/types/electron.d.ts
interface ElectronAPI {
  compressVideo: (options: CompressOptions) => Promise<CompressResult>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
```

### Step 4: Use in Renderer

```typescript
// src/services/video/compressor.ts
const result = await window.electronAPI.compressVideo(options);
```

---

## Directory Structure

```
electron/
├── main.ts              # Main process entry, IPC handlers
├── preload.ts           # Context bridge
├── logger.ts            # Logging utilities
├── i18n.ts              # i18n for main process
├── locales/             # Main process locales
└── services/            # Native service integrations
    ├── ffmpegService.ts
    ├── localWhisper.ts
    └── videoPreviewTranscoder.ts
```

---

## Naming Conventions

### IPC Channels

Use `feature:action` format:

```typescript
// ✅ Good
'video:compress';
'audio:extract';
'subtitle:export';
'file:select';
'app:getVersion';

// ❌ Bad
'compressVideo';
'COMPRESS_VIDEO';
'video_compress';
```

---

## Resource Files

For detailed guidelines, see the resources directory:

- [ipc-patterns.md](resources/ipc-patterns.md) - IPC communication patterns
- [native-services.md](resources/native-services.md) - Native service integration
- [security-guide.md](resources/security-guide.md) - Security best practices
