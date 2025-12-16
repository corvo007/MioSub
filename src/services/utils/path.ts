/**
 * Path Utility Functions
 * Cross-platform path handling for renderer process using pathe
 */
import { dirname, basename, extname, join } from 'pathe';

/**
 * Extract directory from a file path
 */
export const getDirectory = (path: string): string => dirname(path);

/**
 * Extract filename from a path
 */
export const getFilename = (path: string): string => basename(path);

/**
 * Remove extension from filename
 */
export const removeExtension = (filename: string): string => basename(filename, extname(filename));

/**
 * Generate output path with suffix
 */
export const generateOutputPath = (
  originalPath: string,
  originalName: string,
  suffix: string = '_compressed.mp4'
): string => {
  const dir = getDirectory(originalPath);
  const name = removeExtension(originalName);

  if (dir && dir !== '.') {
    return join(dir, name + suffix);
  }
  return name + suffix;
};

// Legacy exports for backward compatibility (deprecated)
/** @deprecated Use pathe directly - this function is no longer needed */
export const isWindows = (): boolean => navigator.userAgent.includes('Win');

/** @deprecated Use pathe directly - this function is no longer needed */
export const getPathSeparator = (): string => (isWindows() ? '\\' : '/');
