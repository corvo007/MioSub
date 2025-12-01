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

        // Search paths in order of priority:
        // 1. Next to the executable (useful for portable/manual placement)
        // 2. In 'resources' folder next to executable
        // 3. In standard Electron resources path (packaged app)
        // 4. In app directory 'resources' (dev mode)
        const possiblePaths: string[] = [];

        console.log(`[LocalWhisper] app.getAppPath(): ${app.getAppPath()}`);
        console.log(`[LocalWhisper] app.isPackaged: ${app.isPackaged}`);

        if (app.isPackaged) {
            // Production: Check next to exe and in resources
            possiblePaths.push(path.join(exeDir, binaryName));
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
            console.log(`[LocalWhisper] Checking path: ${p}`);
            if (fs.existsSync(p)) {
                console.log(`[LocalWhisper] Found binary at: ${p}`);
                return p;
            }
        }

        throw new Error(`Whisper CLI binary not found. Searched at: ${possiblePaths.join(', ')}`);
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
        onLog?: (message: string) => void
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
            const binaryPath = this.getBinaryPath();

            // Construct arguments
            // -m model
            // -f input file
            // -oj output json
            // -l language
            // -t threads
            // -np (no print to stdout, optional but good for clean logs)
            const args = [
                '-m', modelPath,
                '-f', inputPath,
                '-oj', // Output JSON
                '-l', language,
                '-t', threads.toString(),
                '-np' // No print
            ];

            if (onLog) onLog(`[LocalWhisper] Spawning (Job ${jobId}): ${binaryPath} ${args.join(' ')}`);
            console.log(`[LocalWhisper] Spawning (Job ${jobId}): ${binaryPath} ${args.join(' ')}`);

            return new Promise((resolve, reject) => {
                const process = spawn(binaryPath, args);
                this.activeProcesses.set(jobId, process);

                let stderr = '';

                process.stderr?.on('data', (data) => {
                    const msg = data.toString();
                    stderr += msg;
                    if (onLog) onLog(`[Whisper CLI] ${msg}`);
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
                        const result = JSON.parse(jsonContent);

                        const subtitles: SubtitleItem[] = (result.transcription || []).map((item: any) => ({
                            start: item.timestamps.from,
                            end: item.timestamps.to,
                            text: item.text.trim()
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
