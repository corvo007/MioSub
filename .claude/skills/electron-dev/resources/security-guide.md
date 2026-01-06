# Electron Security Guide

## Core Security Settings

**Never change these settings:**

```typescript
new BrowserWindow({
  webPreferences: {
    nodeIntegration: false, // ⚠️ CRITICAL
    contextIsolation: true, // ⚠️ CRITICAL
    sandbox: true, // ⚠️ CRITICAL
  },
});
```

## Why These Matter

### nodeIntegration: false

- Prevents renderer process from accessing Node.js APIs
- Without this, malicious scripts could execute system commands
- All Node.js access must go through IPC

### contextIsolation: true

- Preload script runs in isolated context
- Renderer cannot access preload's globals
- Prevents prototype pollution attacks

### sandbox: true

- Limits what preload script can do
- Even if preload is compromised, damage is limited
- Only allowed APIs: contextBridge, ipcRenderer

## Safe IPC Practices

### Input Validation

```typescript
ipcMain.handle('file:read', async (event, filePath: string) => {
  // Type check
  if (typeof filePath !== 'string') {
    throw new Error('Invalid file path type');
  }

  // Path traversal prevention
  const normalizedPath = path.normalize(filePath);
  const allowedDir = app.getPath('userData');

  if (!normalizedPath.startsWith(allowedDir)) {
    throw new Error('Access denied');
  }

  return fs.readFileSync(normalizedPath, 'utf-8');
});
```

### Limit Exposed APIs

```typescript
// ❌ Bad: Exposes too much
contextBridge.exposeInMainWorld('node', {
  fs: require('fs'),
  path: require('path'),
});

// ✅ Good: Specific, limited APIs
contextBridge.exposeInMainWorld('electronAPI', {
  readSubtitle: (path: string) => ipcRenderer.invoke('subtitle:read', path),
  saveSubtitle: (path: string, content: string) =>
    ipcRenderer.invoke('subtitle:save', path, content),
});
```

## Protocol Security

### Custom Protocol

```typescript
// Register secure protocol
protocol.registerFileProtocol('local-video', (request, callback) => {
  const url = request.url.replace('local-video://', '');
  const filePath = decodeURIComponent(url);

  // Validate path
  if (!isAllowedVideoPath(filePath)) {
    callback({ error: -6 }); // net::ERR_FILE_NOT_FOUND
    return;
  }

  callback({ path: filePath });
});
```

## Content Security Policy

```typescript
mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "connect-src 'self' https://api.openai.com https://generativelanguage.googleapis.com",
      ].join('; '),
    },
  });
});
```

## Checklist

- [ ] `nodeIntegration: false`
- [ ] `contextIsolation: true`
- [ ] `sandbox: true`
- [ ] Input validation in all IPC handlers
- [ ] Path traversal prevention
- [ ] Limited API exposure
- [ ] CSP headers configured
- [ ] No `shell.openExternal` with untrusted URLs
