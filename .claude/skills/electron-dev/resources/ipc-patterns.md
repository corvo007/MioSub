# IPC Communication Patterns

## Request-Response Pattern

Most common pattern for async operations:

```typescript
// main.ts
ipcMain.handle('file:read', async (event, filePath: string) => {
  const content = await fs.promises.readFile(filePath, 'utf-8');
  return content;
});

// preload.ts
contextBridge.exposeInMainWorld('electronAPI', {
  readFile: (path: string) => ipcRenderer.invoke('file:read', path),
});

// renderer
const content = await window.electronAPI.readFile('/path/to/file');
```

## Event Streaming Pattern

For progress updates or real-time data:

```typescript
// main.ts
ipcMain.on('transcription:start', (event, options) => {
  const webContents = event.sender;

  transcribe(options, (progress) => {
    webContents.send('transcription:progress', progress);
  })
    .then((result) => {
      webContents.send('transcription:complete', result);
    })
    .catch((error) => {
      webContents.send('transcription:error', error.message);
    });
});

// preload.ts
contextBridge.exposeInMainWorld('electronAPI', {
  startTranscription: (options: TranscriptionOptions) =>
    ipcRenderer.send('transcription:start', options),

  onTranscriptionProgress: (callback: (progress: number) => void) => {
    ipcRenderer.on('transcription:progress', (_, progress) => callback(progress));
  },

  onTranscriptionComplete: (callback: (result: TranscriptionResult) => void) => {
    ipcRenderer.on('transcription:complete', (_, result) => callback(result));
  },
});
```

## Cleanup Pattern

Remove listeners when component unmounts:

```typescript
// preload.ts
contextBridge.exposeInMainWorld('electronAPI', {
  onProgress: (callback: (progress: number) => void) => {
    const handler = (_: any, progress: number) => callback(progress);
    ipcRenderer.on('operation:progress', handler);

    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('operation:progress', handler);
    };
  },
});

// renderer (React)
useEffect(() => {
  const cleanup = window.electronAPI.onProgress((progress) => {
    setProgress(progress);
  });

  return cleanup; // Called on unmount
}, []);
```

## Error Handling

Always wrap in try-catch and return structured responses:

```typescript
// main.ts
ipcMain.handle('operation:execute', async (event, options) => {
  try {
    const result = await executeOperation(options);
    return {
      success: true,
      data: result,
    };
  } catch (error) {
    logger.error('Operation failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});
```

## Validation

Validate input in handler:

```typescript
ipcMain.handle('file:write', async (event, filePath: string, content: string) => {
  // Validate path is within allowed directories
  if (!filePath.startsWith(app.getPath('userData'))) {
    throw new Error('Access denied: path outside allowed directory');
  }

  // Validate content
  if (typeof content !== 'string') {
    throw new Error('Content must be a string');
  }

  await fs.promises.writeFile(filePath, content, 'utf-8');
  return { success: true };
});
```
