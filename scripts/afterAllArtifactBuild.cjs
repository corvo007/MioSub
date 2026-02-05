const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const yaml = require('js-yaml');

/**
 * electron-builder afterAllArtifactBuild hook
 * Patches ZIP archives to use "portable" mode in distribution.json.
 *
 * This is the most robust way to detect portable vs installed mode:
 * - Written at build time, not runtime
 * - Inside the app package, user can't accidentally modify
 * - Platform independent
 * - No external dependencies (registry, file permissions, etc.)
 *
 * IMPORTANT: After patching ZIP files, we must update the SHA512 hashes
 * in the corresponding yml files, otherwise auto-update will fail with
 * "sha512 checksum mismatch" errors. See: MIOSUB-12
 */
exports.default = async function (buildResult) {
  // Track which ZIPs were patched and their new hashes
  const patchedZips = new Map(); // filename -> { sha512, size }

  for (const artifactPath of buildResult.artifactPaths) {
    // Only patch ZIP-like archives (portable distributions)
    if (artifactPath.endsWith('.zip') || artifactPath.endsWith('.7z') || artifactPath.endsWith('.tar.gz')) {
      if (artifactPath.endsWith('.zip')) {
        const result = patchZipDistributionMode(artifactPath);
        if (result) {
          patchedZips.set(path.basename(artifactPath), result);
        }
      }
      // Note: .7z and .tar.gz would need different libraries to patch
    }
  }

  // Update yml files with new hashes
  if (patchedZips.size > 0) {
    for (const artifactPath of buildResult.artifactPaths) {
      if (artifactPath.endsWith('.yml') && !artifactPath.includes('blockmap')) {
        updateYmlHashes(artifactPath, patchedZips);
      }
    }
  }

  return buildResult.artifactPaths;
};

/**
 * Patch ZIP file to set distribution mode to "portable"
 * @returns {{ sha512: string, size: number } | null} New hash and size, or null on failure
 */
function patchZipDistributionMode(zipPath) {
  try {
    const zip = new AdmZip(zipPath);
    const entryName = 'resources/distribution.json';
    const entry = zip.getEntry(entryName);

    const config = {
      mode: 'portable',
      buildTime: new Date().toISOString(),
    };

    if (entry) {
      zip.updateFile(entryName, Buffer.from(JSON.stringify(config, null, 2)));
    } else {
      zip.addFile(entryName, Buffer.from(JSON.stringify(config, null, 2)));
    }

    zip.writeZip(zipPath);
    console.log(`Patched ${path.basename(zipPath)}: distribution mode → portable`);

    // Calculate new SHA512 hash
    const fileBuffer = fs.readFileSync(zipPath);
    const sha512 = crypto.createHash('sha512').update(fileBuffer).digest('base64');
    const size = fileBuffer.length;

    console.log(`  New SHA512: ${sha512.substring(0, 20)}...`);
    return { sha512, size };
  } catch (err) {
    console.error(`Failed to patch ${path.basename(zipPath)}:`, err.message);
    return null;
  }
}

/**
 * Update SHA512 hashes in yml file for patched ZIP files
 */
function updateYmlHashes(ymlPath, patchedZips) {
  try {
    const content = fs.readFileSync(ymlPath, 'utf8');
    const data = yaml.load(content);

    if (!data || !data.files) {
      return;
    }

    let updated = false;

    // Update hashes in files array
    for (const file of data.files) {
      const zipInfo = patchedZips.get(file.url);
      if (zipInfo) {
        console.log(`Updating ${path.basename(ymlPath)}: ${file.url}`);
        console.log(`  Old SHA512: ${file.sha512.substring(0, 20)}...`);
        console.log(`  New SHA512: ${zipInfo.sha512.substring(0, 20)}...`);
        file.sha512 = zipInfo.sha512;
        file.size = zipInfo.size;
        updated = true;
      }
    }

    // Update top-level path/sha512 if it matches a patched ZIP
    if (data.path) {
      const zipInfo = patchedZips.get(data.path);
      if (zipInfo) {
        data.sha512 = zipInfo.sha512;
        updated = true;
      }
    }

    if (updated) {
      fs.writeFileSync(ymlPath, yaml.dump(data, { lineWidth: -1 }));
      console.log(`Updated hashes in ${path.basename(ymlPath)}`);
    }
  } catch (err) {
    console.error(`Failed to update ${path.basename(ymlPath)}:`, err.message);
  }
}
