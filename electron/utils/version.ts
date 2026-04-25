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

/**
 * True only for the "binary file is missing" sentinel — distinct from other
 * sentinels ('unknown' / 'timeout' / 'error') which mean the file exists but
 * the probe failed. Update flows should force-download only on missing files,
 * not on transient probe failures (cold-start AV scan, Gatekeeper, etc.).
 */
export function isMissingSentinel(v: string | undefined): boolean {
  return !!v && v.toLowerCase() === 'not found';
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
  /** Timeout in milliseconds. 30s default — generous enough for cold-start
   *  on Windows-Defender / macOS-Gatekeeper / portable-from-slow-disk. */
  timeoutMs?: number;
}

// In-memory cache: key is the absolute binary path, value is the resolved
// version string. Only successful probes are cached; sentinels ('unknown',
// 'Timeout', 'Error', 'Not found') are not cached so the next call gets to
// retry. This eliminates re-probe noise on About-tab refreshes within a
// session — same pattern as ytdlp.cachedVersions in commit 09c0b12.
const versionCache = new Map<string, string>();

/**
 * Spawn a binary with a version flag, parse the output with a regex,
 * and return the version string or a sentinel ('Not found', 'Error', 'Timeout').
 *
 * Consolidates the repeated version detection pattern used by
 * CTCAligner, VocalSeparator, and other binary services.
 */
export async function detectBinaryVersion(opts: DetectBinaryVersionOptions): Promise<string> {
  const { binaryPath, versionFlag, parseRegex, label, timeoutMs = 30000 } = opts;

  if (!fs.existsSync(binaryPath)) {
    return 'Not found';
  }

  const cached = versionCache.get(binaryPath);
  if (cached) return cached;

  return new Promise((resolve) => {
    try {
      const spawnConfig = buildSpawnArgs(binaryPath, [versionFlag]);
      const proc = spawn(spawnConfig.command, spawnConfig.args, {
        windowsHide: true,
        ...spawnConfig.options,
      });

      let output = '';
      // Tracks whether the timeout fired and we killed the process. The
      // close handler must skip Sentry capture in that case — empty output
      // after a kill is *not* a parse failure worth reporting; the 'Timeout'
      // sentinel already conveys that state to the caller.
      let timedOut = false;

      proc.stdout.on('data', (d) => {
        output += d.toString();
      });
      proc.stderr?.on('data', (d) => {
        output += d.toString();
      });

      proc.on('close', () => {
        const trimmed = output.trim();
        const match = trimmed.match(parseRegex);
        if (match) {
          versionCache.set(binaryPath, match[1]);
          resolve(match[1]);
          return;
        }

        // Skip Sentry noise from two known-benign cases:
        //   1. We killed the process via timeout — 'Timeout' was already resolved.
        //   2. The process exited cleanly with empty output — no diagnostic value.
        if (!timedOut && trimmed.length > 0) {
          console.warn(`[${label}] Version parse failed, output: ${trimmed.slice(0, 200)}`);
          Sentry.captureMessage(`${label} version parse failed`, {
            level: 'warning',
            extra: { output: trimmed.slice(0, 500), binaryPath },
          });
        }
        resolve('unknown');
      });

      proc.on('error', (err) => {
        console.warn(`[${label}] Failed to get version: ${err.message}`);
        Sentry.captureException(err, { tags: { action: `${label.toLowerCase()}-version` } });
        resolve('Error');
      });

      setTimeout(() => {
        if (!proc.killed) {
          timedOut = true;
          proc.kill();
          resolve('Timeout');
        }
      }, timeoutMs);
    } catch {
      resolve('Error');
    }
  });
}
