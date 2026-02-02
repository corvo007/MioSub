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
