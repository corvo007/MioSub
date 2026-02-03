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
 * Build spawn arguments for Windows that correctly handle Unicode paths.
 *
 * Windows cmd.exe uses the system ANSI code page (e.g., CP936 for Chinese) by default,
 * which corrupts UTF-8 encoded paths. This function prepends `chcp 65001` to switch
 * to UTF-8 code page before executing the command.
 *
 * @param binaryPath - The path to the executable (will be escaped)
 * @param args - The arguments to pass (will be escaped)
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
  options: { shell?: boolean };
} {
  if (process.platform === 'win32') {
    // Escape binary path and args for shell mode
    const escapedBinaryPath = escapeShellArg(binaryPath);
    const escapedArgs = args.map(escapeShellArg);

    // Build full command with chcp 65001 to force UTF-8 code page
    // This fixes path encoding issues for non-ASCII characters (e.g., Chinese paths)
    const fullCommand = `chcp 65001 >nul && ${escapedBinaryPath} ${escapedArgs.join(' ')}`;

    return {
      command: 'cmd',
      args: ['/c', fullCommand],
      options: {}, // shell: false is fine since we're explicitly calling cmd
    };
  }

  // Non-Windows: use binary directly without shell
  return {
    command: binaryPath,
    args,
    options: {},
  };
}
