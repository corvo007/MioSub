import * as Sentry from '@sentry/electron/main';
import fs from 'fs';
import path from 'path';
import { getBinaryPath } from '../../utils/paths.ts';
import { compareVersions, isMissingSentinel, isRealVersion } from '../../utils/version.ts';
import { ctcAlignerService } from '../ctcAligner.ts';
import { ytDlpService } from '../ytdlp.ts';
import { localWhisperService } from '../localWhisper.ts';
import { vocalSeparatorService } from '../vocalSeparator.ts';
import { fetchGitHubRelease } from './githubApi.ts';
import {
  BINARY_REPOS,
  BINARY_COMPANIONS,
  type BinaryName,
  type BinaryUpdateInfo,
} from './types.ts';

// ============================================================================
// Version Detection Helpers
// ============================================================================

async function getCurrentBinaryVersion(
  name: BinaryName,
  whisperCustomBinaryPath?: string
): Promise<string> {
  try {
    if (name === 'aligner') {
      return await ctcAlignerService.getVersion();
    } else if (name === 'ytdlp') {
      const versions = await ytDlpService.getVersions();
      return versions.ytdlp;
    } else if (name === 'whisper') {
      const details = await localWhisperService.getWhisperDetails(whisperCustomBinaryPath);
      if (details.source === 'Custom') return 'custom';
      return details.version.replace(/^v/, '');
    } else if (name === 'bsroformer') {
      return await vocalSeparatorService.getVersion();
    }
  } catch (err) {
    console.error(`[UpdateService] Failed to get ${name} version:`, err);
    Sentry.captureException(err, { tags: { action: 'get-binary-version', binary: name } });
  }
  return 'unknown';
}

function parseAlignerVersion(version: string): string {
  // "cpp-ort-aligner 0.1.2 (582ff15)" -> "0.1.2"
  // "0.1.2" -> "0.1.2"
  const match = version.match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : version;
}

function parseYtdlpVersion(version: string): string {
  // "2024.12.23" -> "2024.12.23"
  return version.trim();
}

function compareYtdlpVersions(a: string, b: string): number {
  // yt-dlp uses date format: 2024.12.23
  // Compare as strings since they're lexicographically sortable
  if (a > b) return 1;
  if (a < b) return -1;
  return 0;
}

// ============================================================================
// Public API
// ============================================================================

export async function checkBinaryUpdate(
  name: BinaryName,
  whisperCustomBinaryPath?: string
): Promise<BinaryUpdateInfo> {
  const repo = BINARY_REPOS[name];
  const current = await getCurrentBinaryVersion(name, whisperCustomBinaryPath);

  // Skip update check for custom (third-party) binaries
  if (current === 'custom') {
    return { name, current: 'custom', latest: '', hasUpdate: false };
  }

  const result: BinaryUpdateInfo = {
    name,
    current,
    latest: 'unknown',
    hasUpdate: false,
  };

  try {
    const release = await fetchGitHubRelease(repo.owner, repo.repo);
    if (!release.success || !release.data) {
      console.warn(`[UpdateService] Failed to fetch ${name} release:`, release.error);
      return result;
    }

    const tagName = release.data.tag_name || '';
    result.releaseUrl = release.data.html_url;

    const platform = process.platform; // 'win32' | 'darwin' | 'linux'
    const arch = process.arch; // 'x64' | 'arm64' | 'ia32'

    if (name === 'aligner') {
      // Aligner: tag is "v0.1.2" or "0.1.2"
      result.latest = tagName.replace(/^v/, '');
      const currentParsed = parseAlignerVersion(current);
      if (isMissingSentinel(current)) {
        result.hasUpdate = true; // Binary missing — force download.
      } else if (!isRealVersion(currentParsed)) {
        result.hasUpdate = false; // Probe failed (timeout/unknown) — don't nag.
      } else {
        result.hasUpdate = compareVersions(result.latest, currentParsed) > 0;
      }

      // Force update if companion libraries are missing (e.g. onnxruntime.dll)
      if (!result.hasUpdate) {
        const binPath = getBinaryPath('cpp-ort-aligner');
        const platformKey = `${process.platform}-${process.arch}`;
        const companions = BINARY_COMPANIONS['cpp-ort-aligner']?.[platformKey] || [];
        for (const lib of companions) {
          if (!fs.existsSync(path.join(path.dirname(binPath), lib))) {
            result.hasUpdate = true;
            break;
          }
        }
      }

      // Find platform and arch specific binary asset
      // Naming: cpp-ort-aligner-{platform}-{arch}.{zip|tar.gz}
      // Exclude -symbols files
      const asset = release.data.assets?.find((a: any) => {
        const assetName = a.name.toLowerCase();
        // Skip symbol files
        if (assetName.includes('-symbols')) return false;

        if (platform === 'win32') {
          // Windows: .zip format
          if (
            arch === 'arm64' &&
            assetName.includes('windows-arm64') &&
            assetName.endsWith('.zip')
          ) {
            return true;
          }
          // Default to x64 for Windows
          return assetName.includes('windows-x64') && assetName.endsWith('.zip');
        } else if (platform === 'darwin') {
          // macOS: universal2 .tar.gz (supports both x64 and arm64)
          return assetName.includes('macos-universal2') && assetName.endsWith('.tar.gz');
        } else if (platform === 'linux') {
          // Linux: .tar.gz format
          if (
            arch === 'arm64' &&
            assetName.includes('linux-arm64') &&
            assetName.endsWith('.tar.gz')
          ) {
            return true;
          }
          return assetName.includes('linux-x64') && assetName.endsWith('.tar.gz');
        }
        return false;
      });
      if (asset) {
        result.downloadUrl = asset.browser_download_url;
      }
    } else if (name === 'ytdlp') {
      // yt-dlp: tag is "2024.12.23"
      result.latest = tagName;
      const currentParsed = parseYtdlpVersion(current);
      if (isMissingSentinel(current)) {
        result.hasUpdate = true; // Binary missing — force download.
      } else if (!isRealVersion(currentParsed)) {
        result.hasUpdate = false; // Probe failed (timeout/unknown) — don't nag.
      } else {
        result.hasUpdate = compareYtdlpVersions(result.latest, currentParsed) > 0;
      }

      // Find platform-specific binary asset
      // yt-dlp naming: yt-dlp.exe (Windows), yt-dlp_macos (macOS universal), yt-dlp_linux (Linux)
      // Note: yt-dlp provides universal binaries for macOS that work on both Intel and Apple Silicon
      const asset = release.data.assets?.find((a: any) => {
        const assetName = a.name;
        if (platform === 'win32') {
          // Windows: yt-dlp.exe or yt-dlp_win.exe
          return assetName === 'yt-dlp.exe' || assetName === 'yt-dlp_win.exe';
        } else if (platform === 'darwin') {
          // macOS: yt-dlp_macos (universal binary)
          return assetName === 'yt-dlp_macos';
        } else if (platform === 'linux') {
          // Linux: yt-dlp_linux or yt-dlp_linux_aarch64 for arm64
          if (arch === 'arm64') {
            return assetName === 'yt-dlp_linux_aarch64';
          }
          return assetName === 'yt-dlp_linux';
        }
        return false;
      });
      if (asset) {
        result.downloadUrl = asset.browser_download_url;
      }
    } else if (name === 'whisper') {
      // whisper.cpp: tag is "v1.8.5-custom"
      const latestVersion = tagName.replace(/^v/, '').replace(/-custom$/, '');
      result.latest = latestVersion;

      if (isMissingSentinel(current)) {
        result.hasUpdate = true; // Binary missing — force download.
      } else if (!isRealVersion(current)) {
        result.hasUpdate = false; // Probe failed (timeout/unknown) — don't nag.
      } else {
        result.hasUpdate = compareVersions(latestVersion, current) > 0;
      }

      // Asset naming: whisper-windows-x86_64.zip, whisper-macos-arm64.tar.gz, etc.
      const asset = release.data.assets?.find((a: any) => {
        const n = a.name.toLowerCase();
        if (platform === 'win32') {
          return n.includes('windows') && n.includes('x86_64') && n.endsWith('.zip');
        } else if (platform === 'darwin') {
          if (arch === 'arm64')
            return n.includes('macos') && n.includes('arm64') && n.endsWith('.tar.gz');
          return n.includes('macos') && n.includes('x86_64') && n.endsWith('.tar.gz');
        } else if (platform === 'linux') {
          if (arch === 'arm64')
            return n.includes('linux') && n.includes('arm64') && n.endsWith('.tar.gz');
          return n.includes('linux') && n.includes('x86_64') && n.endsWith('.tar.gz');
        }
        return false;
      });
      if (asset) {
        result.downloadUrl = asset.browser_download_url;
      }
    } else if (name === 'bsroformer') {
      // BSRoformer: tag is "v0.1.0"
      result.latest = tagName.replace(/^v/, '');
      if (isMissingSentinel(current)) {
        result.hasUpdate = true; // Binary missing — force download.
      } else if (!isRealVersion(current)) {
        result.hasUpdate = false; // Probe failed (timeout/unknown) — don't nag.
      } else {
        result.hasUpdate = compareVersions(result.latest, current) > 0;
      }

      // Asset naming: BSRoformer-windows-vulkan.zip, BSRoformer-linux-vulkan.tar.gz,
      // BSRoformer-macos-arm64.tar.gz, BSRoformer-macos-x86_64.tar.gz
      const asset = release.data.assets?.find((a: any) => {
        const n = a.name.toLowerCase();
        if (platform === 'win32') {
          return n.includes('windows') && n.endsWith('.zip');
        } else if (platform === 'darwin') {
          if (arch === 'arm64')
            return n.includes('macos') && n.includes('arm64') && n.endsWith('.tar.gz');
          return n.includes('macos') && n.includes('x86_64') && n.endsWith('.tar.gz');
        } else if (platform === 'linux') {
          if (arch === 'arm64')
            return n.includes('linux') && n.includes('arm64') && n.endsWith('.tar.gz');
          return n.includes('linux') && n.includes('vulkan') && n.endsWith('.tar.gz');
        }
        return false;
      });
      if (asset) {
        result.downloadUrl = asset.browser_download_url;
      }
    }
  } catch (err: any) {
    console.warn(`[UpdateService] Version comparison failed for ${name}:`, err.message);
    Sentry.captureException(err, { tags: { action: 'version-comparison', binary: name } });
  }

  return result;
}

export async function checkAllBinaryUpdates(
  whisperCustomBinaryPath?: string
): Promise<BinaryUpdateInfo[]> {
  const results = await Promise.all([
    checkBinaryUpdate('aligner'),
    checkBinaryUpdate('ytdlp'),
    checkBinaryUpdate('whisper', whisperCustomBinaryPath),
    checkBinaryUpdate('bsroformer'),
  ]);
  return results;
}
