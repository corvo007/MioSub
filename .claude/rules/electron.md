---
globs: ['electron/**']
---

# Electron Security & IPC Rules

## Security Rules

**MUST maintain these settings** in `electron/main.ts` `BrowserWindow`:

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`

## IPC Contract

- IPC handlers: `electron/main.ts` (`ipcMain.handle/on`)
- Preload bridge: `electron/preload.ts` (`contextBridge.exposeInMainWorld`)
- Renderer types: `src/types/electron.d.ts`

When adding new IPC channels:

1. Add handler in `main.ts`
2. Expose in `preload.ts`
3. Update types in `electron.d.ts`
4. Use naming convention: `feature:action` (e.g., `video:compress`)
5. **Pass truth from the source**: If the renderer already knows a fact (e.g., whether a setting is user-configured), pass it as a flag via IPC. Do NOT have the main process re-derive it by duplicating discovery logic.

## Protocols

- `local-video://` - Custom protocol for streaming video files (supports tailing for in-progress transcodes)
