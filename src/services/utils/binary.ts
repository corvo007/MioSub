/**
 * Binary Resolution Utilities
 *
 * Helper functions for resolving external binary paths.
 */

import { logger } from '@/services/utils/logger';

/**
 * Resolve a binary path, prioritizing custom paths over built-in resources.
 *
 * @param customPath - Optional custom path from settings
 * @param resourceName - Name of the resource executable (e.g., 'cpp-ort-aligner.exe')
 * @param description - Human-readable description for error messages
 * @returns Resolved absolute path string
 * @throws Error if path cannot be resolved
 */
export async function resolveBinaryPath(
  customPath: string | undefined,
  resourceName: string,
  description: string = resourceName
): Promise<string> {
  // 1. If custom path is provided, use it directly
  if (customPath?.trim()) {
    logger.debug(`[Binary] Using custom path for ${description}: ${customPath}`);
    return customPath.trim();
  }

  // 2. Resolve from built/packaged resources
  if (!window.electronAPI) {
    throw new Error(`Cannot resolve ${description}: Electron environment not available`);
  }

  logger.debug(`[Binary] Resolving built-in resource for ${description}: ${resourceName}`);
  const result = await window.electronAPI.getResourcePath(resourceName);

  if (!result.success || !result.path) {
    const errorMsg = result.error || 'Unknown error resolving resource';
    logger.error(`[Binary] Failed to resolve ${description}`, { error: errorMsg });
    throw new Error(`Failed to locate ${description} binary. Please check installation.`);
  }

  return result.path;
}
