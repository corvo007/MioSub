/**
 * Shell utilities for safe command execution on Windows.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';

/**
 * Escape shell arguments for Windows CMD when using shell: true in spawn().
 * Wraps arguments containing special characters in double quotes
 * and escapes internal double quotes by doubling them.
 *
 * Special characters that need escaping in CMD: & | < > ^ " ( ) ! % space
 *
 * @param arg - The argument to escape
 * @returns The escaped argument (unchanged on non-Windows platforms)
 */
export function escapeShellArg(arg: string): string {
  if (process.platform !== 'win32') return arg;

  // Check if argument contains characters that need escaping in CMD
  // Special chars: & | < > ^ " ( ) ! % space
  if (/[&|<>^"()!%\s]/.test(arg)) {
    // Escape internal double quotes by doubling them
    const escaped = arg.replace(/"/g, '""');
    return `"${escaped}"`;
  }
  return arg;
}

/**
 * Escape an array of shell arguments for Windows CMD.
 *
 * @param args - The arguments to escape
 * @returns The escaped arguments array
 */
export function escapeShellArgs(args: string[]): string[] {
  return args.map(escapeShellArg);
}

/**
 * Build spawn arguments that correctly handle Unicode paths.
 *
 * On Windows, we spawn the binary directly without cmd.exe to avoid encoding issues.
 * When using cmd.exe with `cmd /c "command"`, Node.js converts the command string
 * to the system ANSI code page (e.g., CP936 for Chinese), which corrupts UTF-8 paths.
 * Additionally, cmd.exe re-parses the command string, splitting arguments at spaces
 * even when they're quoted.
 *
 * By spawning directly:
 * 1. Arguments are passed as an array, preserving spaces within arguments
 * 2. Node.js passes arguments as UTF-16 to the Windows CreateProcess API
 * 3. The child process receives Unicode arguments correctly
 *
 * @param binaryPath - The path to the executable
 * @param args - The arguments to pass
 * @returns Object with { command, args, options } ready for spawn()
 *
 * @example
 * const { command, args, options } = buildSpawnArgs(binaryPath, ['--help']);
 * const proc = spawn(command, args, { ...options, windowsHide: true });
 */
export function buildSpawnArgs(
  binaryPath: string,
  args: string[]
): {
  command: string;
  args: string[];
  options: { shell?: boolean; windowsHide?: boolean };
} {
  // Spawn binary directly on all platforms - no shell needed
  // This ensures:
  // 1. Arguments with spaces are preserved (no shell re-parsing)
  // 2. Unicode paths work correctly (no code page conversion)
  return {
    command: binaryPath,
    args,
    options: {
      windowsHide: true, // Hide console window on Windows
    },
  };
}

/**
 * Check if a string contains non-ASCII characters.
 */
function hasNonAscii(str: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[^\x00-\x7F]/.test(str);
}

/**
 * Get an ASCII-safe temporary directory on Windows.
 *
 * The default os.tmpdir() is under the user profile (C:\Users\用户名\AppData\...),
 * which contains non-ASCII characters for Chinese/Japanese/Korean usernames.
 *
 * Preference order:
 * 1. os.tmpdir() if already ASCII-safe
 * 2. %ProgramData%\miosub\tmp (C:\ProgramData\miosub\tmp — ASCII, all users writable)
 */
function getAsciiSafeTempDir(): string {
  const defaultTmp = os.tmpdir();
  if (!hasNonAscii(defaultTmp)) return defaultTmp;

  const programData = process.env.ProgramData || 'C:\\ProgramData';
  const safeDir = path.join(programData, 'miosub', 'tmp');

  return safeDir;
}

/**
 * Create an ASCII-safe symlink for a file path containing non-ASCII characters.
 *
 * Many native CLI tools on Windows (e.g., whisper.cpp) use C runtime's
 * main(argc, argv) which converts the UTF-16 command line to the system ANSI
 * code page (e.g., CP936 for Chinese). If the tool then assumes UTF-8 internally,
 * non-ASCII paths get corrupted and cause crashes (STATUS_STACK_BUFFER_OVERRUN).
 *
 * This function creates a symlink with an ASCII-only name in an ASCII-safe
 * temp directory, allowing the native tool to open the file without encoding issues.
 *
 * @param filePath - The original file path (may contain non-ASCII characters)
 * @returns Object with `safePath` (ASCII-only path to use) and `cleanup` function.
 *          If the path is already ASCII-safe, `safePath` is the original and `cleanup` is a no-op.
 */
export async function ensureAsciiSafePath(filePath: string): Promise<{
  safePath: string;
  cleanup: () => Promise<void>;
}> {
  if (process.platform !== 'win32' || !hasNonAscii(filePath)) {
    return { safePath: filePath, cleanup: async () => {} };
  }

  console.log(`[Shell] Non-ASCII path detected, creating safe alias: ${filePath}`);

  try {
    const safeDir = getAsciiSafeTempDir();
    await fs.promises.mkdir(safeDir, { recursive: true });

    const ext = path.extname(filePath);
    const safeName = `miosub_${uuidv4()}${ext}`;
    const safePath = path.join(safeDir, safeName);

    let method = 'symlink';
    try {
      await fs.promises.symlink(filePath, safePath);
    } catch {
      try {
        await fs.promises.link(filePath, safePath);
        method = 'hardlink';
      } catch {
        await fs.promises.copyFile(filePath, safePath);
        method = 'copy';
      }
    }

    console.log(`[Shell] Safe alias created (${method}): ${safePath}`);

    return {
      safePath,
      cleanup: async () => {
        try {
          if (fs.existsSync(safePath)) await fs.promises.unlink(safePath);
        } catch {
          // Best-effort cleanup
        }
      },
    };
  } catch (e) {
    console.warn(`[Shell] Failed to create safe alias, using original path: ${e}`);
    return { safePath: filePath, cleanup: async () => {} };
  }
}

/**
 * Get an ASCII-safe temporary directory path for writing new files.
 * Prefers the default OS temp directory; only falls back to an ASCII-safe
 * alternative when the default path contains non-ASCII characters
 * (e.g., Chinese Windows username → C:\Users\张三\AppData\Local\Temp).
 */
export function getAsciiSafeTempPath(filename: string): string {
  const defaultDir = os.tmpdir();
  const dir =
    process.platform === 'win32' && hasNonAscii(defaultDir) ? getAsciiSafeTempDir() : defaultDir;
  if (dir !== defaultDir) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, filename);
}
