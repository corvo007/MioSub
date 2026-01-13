import { app } from 'electron';
import path from 'path';
import fs from 'fs';

/**
 * Get the path to a binary file in the resources directory.
 * Handles both production (packaged) and development environments.
 * Automatically adds .exe extension on Windows if missing.
 */
export function getBinaryPath(name: string): string {
  const binaryName = process.platform === 'win32' && !name.endsWith('.exe') ? `${name}.exe` : name;

  if (app.isPackaged) {
    return path.join(process.resourcesPath, binaryName);
  }

  // In development, resources are in the project root
  // process.cwd() is usually the project root in dev mode
  return path.join(process.cwd(), 'resources', binaryName);
}

/**
 * Get a hash string based on file path and modification time.
 * Used for detecting binary updates.
 */
export function getFileHash(filePath: string): string {
  try {
    if (!filePath || !fs.existsSync(filePath)) return 'missing';
    const stats = fs.statSync(filePath);
    return `${filePath}:${stats.mtimeMs}`;
  } catch {
    return 'error';
  }
}
