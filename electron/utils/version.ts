import * as fs from 'fs';
import { spawn } from 'child_process';
import * as Sentry from '@sentry/electron/main';
import { buildSpawnArgs } from './shell.ts';

/**
 * Sentinel values returned by binary version detection when a real version
 * string is unavailable. Shared between systemInfoService and preflightCheck
 * to keep the list in sync.
 */
export const VERSION_SENTINELS = new Set(['not found', 'error', 'unknown', 'timeout']);

/** Check whether a version string is a real version (not a sentinel). */
export function isRealVersion(v: string | undefined): v is string {
  return !!v && !VERSION_SENTINELS.has(v.toLowerCase());
}

/** Matches a simple semver-like string: optional "v" prefix + dot-separated digits. */
const SEMVER_RE = /^v?\d+(\.\d+)*$/i;

/**
 * Compare two semver version strings (e.g. "0.2.0" vs "0.1.5").
 * Handles optional "v" prefix (e.g. "v0.2.0").
 *
 * @throws {Error} if either string is not a valid semver version.
 * @returns  1 if a > b, -1 if a < b, 0 if equal
 */
export function compareVersions(a: string, b: string): number {
  if (!SEMVER_RE.test(a)) throw new Error(`Invalid version string: "${a}"`);
  if (!SEMVER_RE.test(b)) throw new Error(`Invalid version string: "${b}"`);
  const parse = (v: string) => v.replace(/^v/i, '').split('.').map(Number);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

// ============================================================================
// Binary Version Detection (shared utility)
// ============================================================================

interface DetectBinaryVersionOptions {
  /** Absolute path to the binary. */
  binaryPath: string;
  /** CLI flag to trigger version output (e.g. '-v', '--version'). */
  versionFlag: string;
  /** Regex with a capture group for the version number. */
  parseRegex: RegExp;
  /** Label for log/Sentry messages (e.g. 'CTCAligner', 'BSRoformer'). */
  label: string;
  /** Timeout in milliseconds (default: 3000). */
  timeoutMs?: number;
}

/**
 * Spawn a binary with a version flag, parse the output with a regex,
 * and return the version string or a sentinel ('Not found', 'Error', 'Timeout').
 *
 * Consolidates the repeated version detection pattern used by
 * CTCAligner, VocalSeparator, and other binary services.
 */
export async function detectBinaryVersion(opts: DetectBinaryVersionOptions): Promise<string> {
  const { binaryPath, versionFlag, parseRegex, label, timeoutMs = 3000 } = opts;

  if (!fs.existsSync(binaryPath)) {
    return 'Not found';
  }

  return new Promise((resolve) => {
    try {
      const spawnConfig = buildSpawnArgs(binaryPath, [versionFlag]);
      const proc = spawn(spawnConfig.command, spawnConfig.args, {
        windowsHide: true,
        ...spawnConfig.options,
      });

      let output = '';
      proc.stdout.on('data', (d) => {
        output += d.toString();
      });
      proc.stderr?.on('data', (d) => {
        output += d.toString();
      });

      proc.on('close', () => {
        const match = output.trim().match(parseRegex);
        if (!match) {
          console.warn(`[${label}] Version parse failed, output: ${output.trim().slice(0, 200)}`);
          Sentry.captureMessage(`${label} version parse failed`, {
            level: 'warning',
            extra: { output: output.trim().slice(0, 500) },
          });
        }
        resolve(match ? match[1] : 'unknown');
      });

      proc.on('error', (err) => {
        console.warn(`[${label}] Failed to get version: ${err.message}`);
        Sentry.captureException(err, { tags: { action: `${label.toLowerCase()}-version` } });
        resolve('Error');
      });

      setTimeout(() => {
        if (!proc.killed) {
          proc.kill();
          resolve('Timeout');
        }
      }, timeoutMs);
    } catch {
      resolve('Error');
    }
  });
}
