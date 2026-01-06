# Native Service Integration

## FFmpeg Integration

Location: `electron/services/ffmpegService.ts`

### Basic Usage

```typescript
import { spawn } from 'child_process';
import { app } from 'electron';
import path from 'path';

function getFFmpegPath(): string {
  const resourcesPath = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, '../../resources');

  return path.join(resourcesPath, 'ffmpeg.exe');
}

export async function extractAudio(videoPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(getFFmpegPath(), [
      '-i',
      videoPath,
      '-vn',
      '-acodec',
      'pcm_s16le',
      '-ar',
      '16000',
      '-ac',
      '1',
      outputPath,
    ]);

    ffmpeg.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}`));
    });

    ffmpeg.on('error', reject);
  });
}
```

### With Progress Reporting

```typescript
export async function compressVideo(
  inputPath: string,
  outputPath: string,
  onProgress: (percent: number) => void
): Promise<void> {
  // Get duration first
  const duration = await getVideoDuration(inputPath);

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(getFFmpegPath(), [
      '-i',
      inputPath,
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-progress',
      'pipe:1',
      outputPath,
    ]);

    ffmpeg.stdout.on('data', (data) => {
      const output = data.toString();
      const timeMatch = output.match(/out_time_ms=(\d+)/);
      if (timeMatch) {
        const currentMs = parseInt(timeMatch[1]) / 1000000;
        const percent = Math.min((currentMs / duration) * 100, 100);
        onProgress(percent);
      }
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}`));
    });
  });
}
```

## Whisper Integration

Location: `electron/services/localWhisper.ts`

```typescript
import { spawn } from 'child_process';

export async function transcribe(
  audioPath: string,
  modelPath: string,
  options: WhisperOptions
): Promise<TranscriptionResult> {
  const whisperPath = getWhisperPath();

  return new Promise((resolve, reject) => {
    const args = [
      '-m',
      modelPath,
      '-f',
      audioPath,
      '-l',
      options.language || 'auto',
      '--output-srt',
    ];

    const whisper = spawn(whisperPath, args);

    let output = '';
    whisper.stdout.on('data', (data) => {
      output += data.toString();
    });

    whisper.on('close', (code) => {
      if (code === 0) {
        resolve(parseWhisperOutput(output));
      } else {
        reject(new Error(`Whisper exited with code ${code}`));
      }
    });
  });
}
```

## File System Operations

### Safe Path Resolution

```typescript
import { app } from 'electron';
import path from 'path';

function resolveSafePath(relativePath: string): string {
  const basePath = app.getPath('userData');
  const resolved = path.resolve(basePath, relativePath);

  // Prevent path traversal
  if (!resolved.startsWith(basePath)) {
    throw new Error('Path traversal detected');
  }

  return resolved;
}
```

### Temp File Management

```typescript
import { app } from 'electron';
import path from 'path';
import fs from 'fs/promises';

export async function createTempFile(prefix: string, extension: string): Promise<string> {
  const tempDir = path.join(app.getPath('temp'), 'gemini-subtitle-pro');
  await fs.mkdir(tempDir, { recursive: true });

  const filename = `${prefix}-${Date.now()}${extension}`;
  return path.join(tempDir, filename);
}

export async function cleanupTempFiles(): Promise<void> {
  const tempDir = path.join(app.getPath('temp'), 'gemini-subtitle-pro');
  await fs.rm(tempDir, { recursive: true, force: true });
}
```
