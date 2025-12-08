/**
 * Path Utility Functions
 * Cross-platform path handling for renderer process
 */

/**
 * Detect if running on Windows
 */
export const isWindows = (): boolean => {
  return navigator.userAgent.includes('Win');
};

/**
 * Get the path separator for current platform
 */
export const getPathSeparator = (): string => {
  return isWindows() ? '\\' : '/';
};

/**
 * Extract directory from a file path
 */
export const getDirectory = (path: string): string => {
  const sep = getPathSeparator();
  if (path.includes(sep)) {
    return path.substring(0, path.lastIndexOf(sep));
  }
  return '';
};

/**
 * Extract filename from a path
 */
export const getFilename = (path: string): string => {
  return path.split(/[\\/]/).pop() || '';
};

/**
 * Remove extension from filename
 */
export const removeExtension = (filename: string): string => {
  return filename.replace(/\.[^/.]+$/, '');
};

/**
 * Generate output path with suffix
 */
export const generateOutputPath = (
  originalPath: string,
  originalName: string,
  suffix: string = '_compressed.mp4'
): string => {
  const sep = getPathSeparator();
  const dir = getDirectory(originalPath);
  const name = removeExtension(originalName);

  if (dir) {
    return `${dir}${sep}${name}${suffix}`;
  }
  return `${name}${suffix}`;
};
