/**
 * CTC Forced Aligner Service (Main Process)
 *
 * Spawns align.exe for precise timestamp alignment using CTC forced alignment.
 * Communicates via JSON stdin/stdout.
 */

import * as fs from 'fs';
import * as path from 'path';
import { platform } from 'os';
import { spawn, type ChildProcess } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { writeTempFile } from './fileUtils.ts';
import { getBinaryPath } from '../utils/paths.ts';
import { escapeShellArg } from '../utils/shell.ts';

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

        // Escape args for shell mode on Windows (handles spaces in paths)
        const escapedArgs = args.map(escapeShellArg);
        const proc = spawn(config.alignerPath, escapedArgs, {
          stdio: ['ignore', 'pipe', 'pipe'], // Ignore stdin, capture stdout/stderr for logging
          cwd: path.dirname(config.alignerPath),
          // Windows-specific: use shell to handle Unicode paths correctly
          ...(platform() === 'win32' && { shell: true }),
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

        proc.on('close', async (code) => {
          this.activeProcesses.delete(jobId);
          this.activeJobRejects.delete(jobId);

          if (stderr) {
            console.warn(`[CTCAligner] stderr: ${stderr}`);
          }

          if (code !== 0) {
            console.error(`[CTCAligner] Process exited with code ${code}`);
            resolve({ success: false, error: `Aligner exited with code ${code}: ${stderr}` });
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
              resolve({
                success: false,
                error: 'Output file not generated by aligner. Check console for logs.',
              });
            }
          } catch (e) {
            console.error(`[CTCAligner] Failed to parse output file: ${e}`);
            console.log(`[CTCAligner] stdout log:\n${stdout.substring(0, 2000)}...`);
            resolve({ success: false, error: `Failed to parse aligner output: ${e}` });
          }
        });

        proc.on('error', (err) => {
          this.activeProcesses.delete(jobId);
          this.activeJobRejects.delete(jobId);
          console.error(`[CTCAligner] Failed to start: ${err.message}`);
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
      reject(new Error('Alignment cancelled by user'));
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
        // Escape args for shell mode on Windows
        const escapedArgs = ['-v'].map(escapeShellArg);
        const proc = spawn(alignerPath, escapedArgs, {
          windowsHide: true,
          // Windows-specific: use shell to handle Unicode paths correctly
          ...(platform() === 'win32' && { shell: true }),
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
          resolve('Error');
        });

        // Timeout to prevent hanging
        setTimeout(() => {
          if (!proc.killed) {
            proc.kill();
            resolve('Timeout');
          }
        }, 3000);
      } catch (e) {
        resolve('Error');
      }
    });
  }
}

export const ctcAlignerService = new CTCAlignerService();
