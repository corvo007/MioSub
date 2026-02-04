/**
 * Shell utilities for safe command execution on Windows.
 */

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
