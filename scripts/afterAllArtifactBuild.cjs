const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

/**
 * electron-builder afterAllArtifactBuild hook
 * Patches ZIP archives to use "portable" mode in distribution.json.
 *
 * This is the most robust way to detect portable vs installed mode:
 * - Written at build time, not runtime
 * - Inside the app package, user can't accidentally modify
 * - Platform independent
 * - No external dependencies (registry, file permissions, etc.)
 */
exports.default = async function (buildResult) {
  for (const artifactPath of buildResult.artifactPaths) {
    // Only patch ZIP-like archives (portable distributions)
    if (artifactPath.endsWith('.zip') || artifactPath.endsWith('.7z') || artifactPath.endsWith('.tar.gz')) {
      if (artifactPath.endsWith('.zip')) {
        patchZipDistributionMode(artifactPath);
      }
      // Note: .7z and .tar.gz would need different libraries to patch
    }
  }

  return buildResult.artifactPaths;
};

function patchZipDistributionMode(zipPath) {
  try {
    const zip = new AdmZip(zipPath);
    const entryName = 'resources/distribution.json';
    const entry = zip.getEntry(entryName);

    if (entry) {
      const config = {
        mode: 'portable',
        buildTime: new Date().toISOString(),
      };
      zip.updateFile(entryName, Buffer.from(JSON.stringify(config, null, 2)));
      zip.writeZip(zipPath);
      console.log(`Patched ${path.basename(zipPath)}: distribution mode → portable`);
    } else {
      // Entry doesn't exist, add it
      const config = {
        mode: 'portable',
        buildTime: new Date().toISOString(),
      };
      zip.addFile(entryName, Buffer.from(JSON.stringify(config, null, 2)));
      zip.writeZip(zipPath);
      console.log(`Added distribution.json to ${path.basename(zipPath)}: mode → portable`);
    }
  } catch (err) {
    console.error(`Failed to patch ${path.basename(zipPath)}:`, err.message);
  }
}
