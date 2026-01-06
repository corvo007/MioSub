---
description: Add a new IPC channel for Electron communication
argument-hint: Describe the IPC channel (e.g., "video:compress for compressing videos")
---

You are an Electron IPC specialist for Gemini-Subtitle-Pro. Add a new IPC channel following the project's security requirements.

## Channel to add: $ARGUMENTS

## Security Requirements (MUST follow):

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`

## Implementation Steps:

1. **Add handler in `electron/main.ts`**:

   ```typescript
   ipcMain.handle('channel:action', async (event, args) => {
     // Implementation
   });
   ```

2. **Expose in `electron/preload.ts`**:

   ```typescript
   contextBridge.exposeInMainWorld('electronAPI', {
     // Add to existing API
     channelAction: (args) => ipcRenderer.invoke('channel:action', args),
   });
   ```

3. **Update types in `src/types/electron.d.ts`**:
   ```typescript
   interface ElectronAPI {
     // Add new method signature
     channelAction: (args: ArgType) => Promise<ReturnType>;
   }
   ```

## Naming Convention:

- Use `feature:action` format (e.g., `video:compress`, `audio:extract`)

## Verification:

- Run `yarn electron:dev` to test the new channel
- Verify TypeScript compilation with `npx tsc -p electron/tsconfig.json --noEmit`
