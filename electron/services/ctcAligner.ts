/**
 * CTC Forced Aligner Service (Main Process)
 *
 * Spawns align.exe for precise timestamp alignment using CTC forced alignment.
 * Communicates via JSON stdin/stdout.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn, type ChildProcess } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import * as Sentry from '@sentry/electron/main';
import { writeTempFile } from './fileUtils.ts';
import { getBinaryPath } from '../utils/paths.ts';
import { buildSpawnArgs } from '../utils/shell.ts';
import { ExpectedError } from '../utils/expectedError.ts';

// ============================================================================
// Type Definitions
// ============================================================================

export interface AlignerInputSegment {
  index: number;
  text: string;
  start?: number;
  end?: number;
}

export interface AlignerOutputSegment {
  index: number;
  start: number;
  end: number;
  text: string;
  score: number;
}

export interface AlignmentRequest {
  segments: AlignerInputSegment[];
  audioPath: string;
  language: string;
  config: {
    alignerPath: string;
    modelPath: string;
    batchSize?: number;
    romanize?: boolean;
  };
}

export interface AlignmentResult {
  success: boolean;
  segments?: AlignerOutputSegment[];
  metadata?: {
    count: number;
    processing_time: number;
  };
  error?: string;
}

// Languages that require romanization for CTC alignment
const ROMANIZE_LANGUAGES = ['cmn', 'jpn', 'kor', 'ara', 'rus', 'zho', 'yue'];

// Minimum free memory required to spawn aligner (1 GB)
// ONNX Runtime loads the model (~1GB) into memory on startup; on 8GB M1 Macs
// this can trigger macOS OOM killer (SIGKILL) if free memory is too low.
// Ref: MIOSUB-1N investigation - 512MB was insufficient, raised to 1GB.
const MIN_FREE_MEMORY_BYTES = 1024 * 1024 * 1024;

// ============================================================================
// CTC Aligner Service
// ============================================================================

export class CTCAlignerService {
  private activeProcesses: Map<string, ChildProcess> = new Map();
  private activeJobRejects: Map<string, (reason?: any) => void> = new Map();

  /**
   * Align segments using CTC forced aligner.
   */
  async align(request: AlignmentRequest): Promise<AlignmentResult> {
    const { segments, audioPath, language, config } = request;
    const jobId = uuidv4();

    // P0: Memory pre-check — skip alignment if free memory is too low (Ref: MIOSUB-1N)
    const freeMem = os.freemem();
    if (freeMem < MIN_FREE_MEMORY_BYTES) {
      const freeMB = Math.round(freeMem / 1024 / 1024);
      console.warn(
        `[CTCAligner] Skipping alignment: insufficient memory (${freeMB}MB free, need ${MIN_FREE_MEMORY_BYTES / 1024 / 1024}MB)`
      );
      return {
        success: false,
        error: `Insufficient memory for alignment (${freeMB}MB free)`,
      };
    }

    // Validate paths
    if (!fs.existsSync(config.alignerPath)) {
      return { success: false, error: `Aligner not found: ${config.alignerPath}` };
    }
    if (!fs.existsSync(config.modelPath)) {
      return { success: false, error: `Model not found: ${config.modelPath}` };
    }
    if (!fs.existsSync(audioPath)) {
      return { success: false, error: `Audio file not found: ${audioPath}` };
    }

    // Use temp storage for IPC to avoid stdin encoding issues on Windows
    // We use the shared writeTempFile utility to generate paths and write input

    // 1. Write Input File (no BOM for Python JSON parser)
    const inputData = { segments };
    const inputResult = await writeTempFile(JSON.stringify(inputData), 'json', false);
    if (!inputResult.success || !inputResult.path) {
      return { success: false, error: inputResult.error || 'Failed to create temp input file' };
    }
    const inputJsonPath = inputResult.path;

    // 2. Create Output File Placeholder
    const outputResult = await writeTempFile('', 'json', false);
    if (!outputResult.success || !outputResult.path) {
      // Clean up input if output creation fails
      try {
        fs.unlinkSync(inputJsonPath);
      } catch {
        /* ignore */
      }
      return { success: false, error: outputResult.error || 'Failed to create temp output file' };
    }
    const outputJsonPath = outputResult.path;

    try {
      // Build command arguments (paths are already set above)
      const args = [
        '--audio',
        audioPath,
        '--json-input',
        inputJsonPath,
        '--json-output',
        outputJsonPath,
        '--model',
        config.modelPath,
        '--language',
        language,
      ];

      // Add romanize flag for CJK languages
      if (config.romanize ?? ROMANIZE_LANGUAGES.includes(language.toLowerCase())) {
        args.push('--romanize');
      }

      // Add batch size if specified
      if (config.batchSize) {
        args.push('--batch-size', String(config.batchSize));
      }

      console.log(`[CTCAligner] Starting alignment (Job ${jobId}): ${config.alignerPath}`);
      console.log(`[CTCAligner] Args: ${args.join(' ')}`);

      return await new Promise((resolve, reject) => {
        this.activeJobRejects.set(jobId, reject);

        // Build spawn arguments with UTF-8 code page support for Windows
        const spawnConfig = buildSpawnArgs(config.alignerPath, args);
        const proc = spawn(spawnConfig.command, spawnConfig.args, {
          stdio: ['ignore', 'pipe', 'pipe'], // Ignore stdin, capture stdout/stderr for logging
          cwd: path.dirname(config.alignerPath),
          ...spawnConfig.options,
        });
        this.activeProcesses.set(jobId, proc);

        let stdout = '';
        let stderr = '';

        proc.stdout?.on('data', (data) => {
          const chunk = data.toString();
          stdout += chunk;
          // Log stdout for debugging
          const lines = chunk.split('\n').filter((l: string) => l.trim());
          lines.forEach((line: string) => {
            console.log(`[CTCAligner] ${line}`);
          });
        });

        proc.stderr?.on('data', (data) => {
          stderr += data.toString();
        });

        proc.on('close', async (code, signal) => {
          this.activeProcesses.delete(jobId);
          this.activeJobRejects.delete(jobId);

          if (stderr) {
            console.warn(`[CTCAligner] stderr: ${stderr}`);
          }

          if (code !== 0) {
            const signalInfo = signal ? ` (signal: ${signal})` : '';
            console.error(`[CTCAligner] Process exited with code ${code}${signalInfo}`);
            Sentry.addBreadcrumb({
              category: 'ctc-aligner',
              message: `Process exited with code ${code}${signalInfo}`,
              level: 'error',
              data: { stderr: stderr.substring(0, 2000), stdout: stdout.substring(0, 2000) },
            });
            resolve({
              success: false,
              error: `Aligner exited with code ${code}${signalInfo}: ${stderr}`,
            });
            return;
          }

          try {
            // Read output JSON from file
            if (fs.existsSync(outputJsonPath)) {
              const outputContent = await fs.promises.readFile(outputJsonPath, 'utf-8');
              const output = JSON.parse(outputContent);

              console.log(
                `[CTCAligner] Aligned ${output.metadata?.count || output.segments?.length} segments`
              );
              resolve({
                success: true,
                segments: output.segments,
                metadata: output.metadata,
              });
            } else {
              console.warn(`[CTCAligner] Output file not found. stdout log:\n${stdout}`);
              Sentry.addBreadcrumb({
                category: 'ctc-aligner',
                message: 'Output file not generated',
                level: 'error',
                data: { stdout: stdout.substring(0, 2000) },
              });
              resolve({
                success: false,
                error: 'Output file not generated by aligner. Check console for logs.',
              });
            }
          } catch (e) {
            console.error(`[CTCAligner] Failed to parse output file: ${e}`);
            Sentry.addBreadcrumb({
              category: 'ctc-aligner',
              message: `Failed to parse output file: ${e}`,
              level: 'error',
              data: { stdout: stdout.substring(0, 2000) },
            });
            resolve({ success: false, error: `Failed to parse aligner output: ${e}` });
          }
        });

        proc.on('error', (err) => {
          this.activeProcesses.delete(jobId);
          this.activeJobRejects.delete(jobId);
          console.error(`[CTCAligner] Failed to start: ${err.message}`);
          Sentry.addBreadcrumb({
            category: 'ctc-aligner',
            message: `Failed to start: ${err.message}`,
            level: 'error',
          });
          resolve({ success: false, error: `Failed to start aligner: ${err.message}` });
        });
      });
    } catch (e: any) {
      return { success: false, error: `IPC setup failed: ${e.message}` };
    } finally {
      // Cleanup temp files (best effort)
      try {
        if (fs.existsSync(inputJsonPath)) fs.unlinkSync(inputJsonPath);
        if (fs.existsSync(outputJsonPath)) fs.unlinkSync(outputJsonPath);
      } catch (e) {
        console.warn(`[CTCAligner] Cleanup failed: ${e}`);
      }
    }
  }

  /**
   * Abort the active alignment process.
   */
  abort(): void {
    console.log(`[CTCAligner] Aborting ${this.activeProcesses.size} active jobs`);

    // Reject all promises
    for (const reject of this.activeJobRejects.values()) {
      reject(new ExpectedError('Alignment cancelled by user'));
    }
    this.activeJobRejects.clear();

    // Kill all processes
    for (const [jobId, proc] of this.activeProcesses) {
      console.log(`[CTCAligner] Killing process for job ${jobId}`);
      proc.kill();
    }
    this.activeProcesses.clear();
  }

  /**
   * Get the version string of the aligner binary.
   */
  async getVersion(customPath?: string): Promise<string> {
    const alignerPath = customPath || getBinaryPath('cpp-ort-aligner');

    if (!fs.existsSync(alignerPath)) {
      return 'Not found';
    }

    return new Promise((resolve) => {
      try {
        // Build spawn arguments with UTF-8 code page support for Windows
        const spawnConfig = buildSpawnArgs(alignerPath, ['-v']);
        const proc = spawn(spawnConfig.command, spawnConfig.args, {
          windowsHide: true,
          ...spawnConfig.options,
        });

        let output = '';
        proc.stdout.on('data', (d) => {
          output += d.toString();
        });

        // Also capture stderr just in case
        proc.stderr?.on('data', (d) => {
          output += d.toString();
        });

        proc.on('close', () => {
          // Parse: cpp-ort-aligner 0.1.2 (582ff15-dirty) -> 0.1.2
          const match = output.trim().match(/cpp-ort-aligner\s+([\d.]+)/);
          resolve(match ? match[1] : output.trim() || 'Unknown');
        });

        proc.on('error', (err) => {
          console.warn(`[CTCAligner] Failed to get version: ${err.message}`);
          Sentry.captureException(err, { tags: { action: 'ctc-aligner-version' } });
          resolve('Error');
        });

        // Timeout to prevent hanging
        setTimeout(() => {
          if (!proc.killed) {
            proc.kill();
            resolve('Timeout');
          }
        }, 3000);
      } catch {
        resolve('Error');
      }
    });
  }
}

export const ctcAlignerService = new CTCAlignerService();
