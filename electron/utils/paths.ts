import { app } from 'electron';
import path from 'path';
import fs from 'fs';

/**
 * Check if the app is running in portable mode.
 *
 * Detection: Read distribution.json from resources directory.
 * This file is written at build time by afterPack.cjs hook:
 * - ZIP/portable builds → mode: "portable"
 * - NSIS/DMG/AppImage builds → mode: "installed"
 *
 * Benefits:
 * - Platform independent
 * - User can't accidentally modify (inside app package)
 * - No external dependencies (registry, file permissions, etc.)
 * - Determined at build time, not runtime
 */
let _isPortable: boolean | null = null;
export function isPortableMode(): boolean {
  if (_isPortable === null) {
    if (!app.isPackaged) {
      _isPortable = true; // Dev mode behaves like portable
    } else {
      _isPortable = readDistributionMode() === 'portable';
    }
  }
  return _isPortable;
}

/**
 * Read distribution mode from resources/distribution.json
 * Fallback: check if exe directory is writable
 */
function readDistributionMode(): 'portable' | 'installed' {
  try {
    const configPath = path.join(process.resourcesPath, 'distribution.json');
    const content = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);
    return config.mode === 'portable' ? 'portable' : 'installed';
  } catch {
    // Fallback: check if exe directory is writable
    // Writable (e.g., user folder) → portable
    // Not writable (e.g., Program Files) → installed
    return isDirectoryWritable(path.dirname(app.getPath('exe'))) ? 'portable' : 'installed';
  }
}

/**
 * Check if a directory is writable by attempting to create a temp file.
 */
function isDirectoryWritable(dir: string): boolean {
  const testFile = path.join(dir, `.write-test-${Date.now()}`);
  try {
    fs.writeFileSync(testFile, '');
    fs.unlinkSync(testFile);
    return true;
  } catch {
    return false;
  }
}

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

/**
 * Get the directory for storing configuration and state files.
 * Portable: directory of the executable + /config
 * Installed: %APPDATA%/MioSub/config
 * Development: project root + /config
 */
export function getStorageDir(): string {
  if (!app.isPackaged) {
    return path.join(process.cwd(), 'config');
  }
  if (isPortableMode()) {
    return path.join(path.dirname(app.getPath('exe')), 'config');
  }
  return path.join(app.getPath('userData'), 'config');
}

/**
 * Get the directory for storing log files.
 * Portable: directory of the executable + /logs
 * Installed: %APPDATA%/MioSub/logs
 * Development: project root + /logs
 */
export function getLogDir(): string {
  if (!app.isPackaged) {
    return path.join(process.cwd(), 'logs');
  }
  if (isPortableMode()) {
    return path.join(path.dirname(app.getPath('exe')), 'logs');
  }
  return path.join(app.getPath('userData'), 'logs');
}
