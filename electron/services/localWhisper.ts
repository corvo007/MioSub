import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';

export interface SubtitleItem {
  start: string;
  end: string;
  text: string;
}

export class LocalWhisperService {
  private getBinaryPath(): string {
    const binaryName = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
    const exePath = app.getPath('exe');
    const exeDir = path.dirname(exePath);

    // Check for portable executable directory (provided by electron-builder for portable apps)
    const portableExeDir = process.env.PORTABLE_EXECUTABLE_DIR;

    // Search paths in order of priority:
    // 1. Portable App: 'resources' folder next to the actual executable
    // 2. Portable App: Next to the actual executable
    // 3. Installed/Unpacked: 'resources' folder next to the executable
    // 4. Installed/Unpacked: Next to the executable
    // 5. Standard Electron resources path
    // 6. Dev mode: Project root 'resources'
    const possiblePaths: string[] = [];

    console.log(`[LocalWhisper] app.getAppPath(): ${app.getAppPath()}`);
    console.log(`[LocalWhisper] app.isPackaged: ${app.isPackaged}`);
    if (portableExeDir) {
      console.log(`[LocalWhisper] Portable Executable Dir: ${portableExeDir}`);
    }

    if (app.isPackaged) {
      // 1. Portable App Support
      if (portableExeDir) {
        possiblePaths.push(path.join(portableExeDir, 'resources', binaryName));
        possiblePaths.push(path.join(portableExeDir, binaryName));
      }

      // 2. Standard/Installed App Support
      possiblePaths.push(path.join(exeDir, 'resources', binaryName));
      possiblePaths.push(path.join(exeDir, binaryName));

      // 3. Electron Standard Resources
      possiblePaths.push(path.join(process.resourcesPath, binaryName));
    } else {
      // Development:
      // app.getAppPath() points to '.../electron' (where main.ts is)
      // We need to look in '.../resources' (project root)
      const projectRoot = path.join(app.getAppPath(), '..');
      possiblePaths.push(path.join(projectRoot, 'resources', binaryName));

      // Also try direct appPath/resources just in case structure changes
      possiblePaths.push(path.join(app.getAppPath(), 'resources', binaryName));
    }

    for (const p of possiblePaths) {
      console.log(`[INFO] [LocalWhisper] Checking path: ${p}`);
      if (fs.existsSync(p)) {
        console.log(`[INFO] [LocalWhisper] Found binary at: ${p}`);
        return p;
      }
    }

    throw new Error(`Whisper CLI binary not found. Searched at: ${possiblePaths.join(', ')}`);
  }

  private getVadModelPath(): string | null {
    const modelName = 'ggml-silero-v6.2.0.bin';
    const exePath = app.getPath('exe');
    const exeDir = path.dirname(exePath);
    const possiblePaths: string[] = [];

    if (app.isPackaged) {
      possiblePaths.push(path.join(exeDir, modelName));
      possiblePaths.push(path.join(process.resourcesPath, modelName));
    } else {
      const projectRoot = path.join(app.getAppPath(), '..');
      possiblePaths.push(path.join(projectRoot, 'resources', modelName));
      possiblePaths.push(path.join(app.getAppPath(), 'resources', modelName));
    }

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        console.log(`[INFO] [LocalWhisper] Found VAD model at: ${p}`);
        return p;
      } else {
        console.log(`[INFO] [LocalWhisper] VAD model not found at: ${p}`);
      }
    }

    console.warn(`[LocalWhisper] VAD model not found. Searched at: ${possiblePaths.join(', ')}`);
    return null;
  }

  private activeProcesses: Map<string, import('child_process').ChildProcess> = new Map();

  validateModel(filePath: string): { valid: boolean; error?: string } {
    try {
      if (!fs.existsSync(filePath)) {
        return { valid: false, error: '模型文件不存在' };
      }
      if (!filePath.endsWith('.bin')) {
        return { valid: false, error: '模型文件格式错误 (需 .bin)' };
      }
      const stats = fs.statSync(filePath);
      if (stats.size < 50 * 1024 * 1024) {
        return { valid: false, error: '模型文件过小 (可能是无效文件)' };
      }
      return { valid: true };
    } catch (error) {
      return { valid: false, error: '无法读取模型文件' };
    }
  }

  abort() {
    this.activeProcesses.forEach((process, id) => {
      console.log(`[LocalWhisper] Aborting process ${id}`);
      process.kill();
    });
    this.activeProcesses.clear();
  }

  async transcribe(
    audioBuffer: ArrayBuffer,
    modelPath: string,
    language: string = 'auto',
    threads: number = 4,
    onLog?: (message: string) => void,
    customBinaryPath?: string
  ): Promise<SubtitleItem[]> {
    // Validate model first
    const validation = this.validateModel(modelPath);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const tempDir = app.getPath('temp');
    const jobId = uuidv4();
    const inputPath = path.join(tempDir, `whisper_input_${jobId}.wav`);

    // Write buffer to file
    await fs.promises.writeFile(inputPath, Buffer.from(audioBuffer));

    try {
      let binaryPath: string;
      if (customBinaryPath && fs.existsSync(customBinaryPath)) {
        binaryPath = customBinaryPath;
        if (onLog) onLog(`[INFO] [LocalWhisper] Using Custom Binary Path: ${binaryPath}`);
        console.log(`[INFO] [LocalWhisper] Using Custom Binary Path: ${binaryPath}`);
      } else {
        if (customBinaryPath && onLog)
          onLog(
            `[WARN] [LocalWhisper] Custom Binary Path not found: ${customBinaryPath}, using default.`
          );
        binaryPath = this.getBinaryPath();
      }

      // Construct arguments
      // -m model
      // -f input file
      // -oj output json
      // -l language
      // -t threads
      // -bs beam size (optimized to 2 for 2.35x speed boost, <1% quality loss)
      // --split-on-word (split at word boundaries for better readability)
      const args = [
        '-m',
        modelPath,
        '-f',
        inputPath,
        '-oj', // Output JSON
        '-l',
        language,
        '-t',
        threads.toString(),
        '-bs',
        '2', // Beam search optimization: 2.35x faster than default (5), quality loss <1%
        '--split-on-word', // Split subtitles at word boundaries for better readability
        '--print-progress', // Show progress for better user experience
        '--entropy-thold',
        '2.4', // Entropy threshold to filter out low-quality/repetitive output (default 2.4)
        '-tp',
        '0.6', // Temperature to break repetition loops while maintaining quality (changed from --temperature)
      ];

      // Add VAD arguments if model exists
      const vadModelPath = this.getVadModelPath();
      if (vadModelPath) {
        args.push('--vad-model', vadModelPath);
        args.push('-vt', '0.50'); // VAD threshold (default 0.50)
        args.push('-vo', '0.10'); // VAD samples overlap (default 0.10)
        if (onLog) onLog(`[LocalWhisper] VAD enabled with model: ${path.basename(vadModelPath)}`);
        console.log(`[LocalWhisper] VAD enabled with model: ${vadModelPath}`);
      } else {
        if (onLog) onLog(`[LocalWhisper] VAD model not found, running without VAD.`);
        console.warn(`[LocalWhisper] VAD model not found, running without VAD.`);
      }

      if (onLog)
        onLog(`[DEBUG] [LocalWhisper] Spawning (Job ${jobId}): ${binaryPath} ${args.join(' ')}`);
      console.log(
        `[DEBUG] [LocalWhisper] Spawning (Job ${jobId}): ${binaryPath} ${args.join(' ')}`
      );

      return new Promise((resolve, reject) => {
        const process = spawn(binaryPath, args);
        this.activeProcesses.set(jobId, process);

        let stdout = '';
        let stderr = '';
        let stdoutBuffer = '';
        let stderrBuffer = '';

        process.stdout?.on('data', (data) => {
          const chunk = data.toString();
          stdout += chunk;
          stdoutBuffer += chunk;

          const lines = stdoutBuffer.split('\n');
          stdoutBuffer = lines.pop() || ''; // Keep the last incomplete line

          lines.forEach((line) => {
            if (line.trim()) {
              // Intermediate output from stdout (if any) -> DEBUG
              // if (onLog) onLog(`[DEBUG] [Whisper CLI] ${line}`);
            }
          });
        });

        process.stderr?.on('data', (data) => {
          const chunk = data.toString();
          stderr += chunk;
          stderrBuffer += chunk;

          const lines = stderrBuffer.split('\n');
          stderrBuffer = lines.pop() || ''; // Keep the last incomplete line

          lines.forEach((line) => {
            if (line.trim()) {
              // Intermediate output from stderr (progress) -> DEBUG
              // if (onLog) onLog(`[DEBUG] [Whisper CLI Info] ${line}`);
            }
          });
        });

        process.on('close', async (code) => {
          this.activeProcesses.delete(jobId); // Remove from active map

          if (code !== 0) {
            const errorMsg = `Process exited with code ${code}`;
            console.error(`[LocalWhisper] ${errorMsg}`);
            if (onLog) onLog(`[LocalWhisper] Error: ${errorMsg}`);
            if (onLog) onLog(`[LocalWhisper] Stderr: ${stderr}`);
            reject(new Error(`Whisper CLI failed with code ${code}: ${stderr}`));
            return;
          }

          // Read output JSON
          // Whisper.cpp generates file with .json appended to input filename
          const outputPath = `${inputPath}.json`;

          try {
            if (!fs.existsSync(outputPath)) {
              reject(new Error('Output JSON file not generated'));
              return;
            }

            const jsonContent = await fs.promises.readFile(outputPath, 'utf-8');

            // Log the raw JSON content (or a summary if too large, but user asked for "all")
            console.log(`[LocalWhisper] JSON Output: ${jsonContent}`);
            if (onLog) onLog(`[LocalWhisper] JSON Output: ${jsonContent}`);

            const result = JSON.parse(jsonContent);

            const subtitles: SubtitleItem[] = (result.transcription || []).map((item: any) => ({
              start: item.timestamps.from,
              end: item.timestamps.to,
              text: item.text.trim(),
            }));

            resolve(subtitles);
          } catch (error) {
            reject(error);
          } finally {
            // Cleanup
            try {
              if (fs.existsSync(inputPath)) await fs.promises.unlink(inputPath);
              if (fs.existsSync(outputPath)) await fs.promises.unlink(outputPath);
            } catch (e) {
              console.error('Failed to cleanup temp files:', e);
            }
          }
        });

        process.on('error', (err) => {
          this.activeProcesses.delete(jobId);
          reject(err);
        });
      });
    } catch (error) {
      // Ensure cleanup if spawn fails
      if (fs.existsSync(inputPath)) await fs.promises.unlink(inputPath);
      throw error;
    }
  }
}

export const localWhisperService = new LocalWhisperService();
