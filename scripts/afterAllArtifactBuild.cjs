const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { execSync } = require('child_process');
const yaml = require('js-yaml');

/**
 * electron-builder afterAllArtifactBuild hook
 * Patches ZIP archives to use "portable" mode in distribution.json.
 *
 * Uses system zip utilities instead of AdmZip to avoid corrupting
 * large binary files (ffmpeg, ffprobe) when rewriting the archive.
 * See: https://github.com/cthackers/adm-zip/issues — known CRC/data
 * corruption with large files.
 *
 * macOS ZIPs require special handling: modifying files inside a signed
 * .app bundle breaks the code signature seal (_CodeSignature/CodeResources).
 * We extract → patch → re-sign → re-archive to preserve a valid seal.
 * See: MIOSUB-1P investigation (KERN_CODESIGN_ERROR on portable mode).
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
        const isMac = path.basename(artifactPath).includes('-mac-');
        const result = isMac
          ? patchMacZipDistributionMode(artifactPath)
          : patchZipDistributionMode(artifactPath);
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
 * Entry path for distribution.json in Windows/Linux ZIPs.
 * macOS ZIPs are handled separately by patchMacZipDistributionMode().
 */
function getEntryPath() {
  return 'resources/distribution.json';
}

/**
 * Patch ZIP file to set distribution mode to "portable".
 * Uses system zip utilities to avoid AdmZip's large-file corruption.
 * @returns {{ sha512: string, size: number } | null} New hash and size, or null on failure
 */
function patchZipDistributionMode(zipPath) {
  const zipName = path.basename(zipPath);
  const entryPath = getEntryPath(zipPath);

  const config = {
    mode: 'portable',
    buildTime: new Date().toISOString(),
  };
  const configJson = JSON.stringify(config, null, 2);

  // Create temp directory with the correct path structure for zip -u
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'miosub-patch-'));
  const tmpFilePath = path.join(tmpDir, ...entryPath.split('/'));
  fs.mkdirSync(path.dirname(tmpFilePath), { recursive: true });
  fs.writeFileSync(tmpFilePath, configJson);

  try {
    if (process.platform === 'win32') {
      patchZipWindows(zipPath, entryPath, configJson);
    } else {
      // macOS/Linux: zip -u updates a single entry without rewriting the archive
      execSync(`cd "${tmpDir}" && zip -u "${zipPath}" "${entryPath}"`, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    }

    console.log(`Patched ${zipName}: distribution mode → portable (entry: ${entryPath})`);

    // Calculate new SHA512 hash
    const fileBuffer = fs.readFileSync(zipPath);
    const sha512 = crypto.createHash('sha512').update(fileBuffer).digest('base64');
    const size = fileBuffer.length;

    console.log(`  New SHA512: ${sha512.substring(0, 20)}...`);
    return { sha512, size };
  } catch (err) {
    console.error(`Failed to patch ${zipName}:`, err.message);
    if (err.stderr) console.error(`  stderr: ${err.stderr.toString()}`);
    return null;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Patch macOS ZIP: extract → patch distribution.json → re-sign → re-archive.
 *
 * Modifying any file inside a signed .app bundle breaks the code signature
 * seal (_CodeSignature/CodeResources). We must re-sign the entire bundle
 * after patching, then use `ditto` to create a signature-preserving ZIP.
 *
 * @returns {{ sha512: string, size: number } | null} New hash and size, or null on failure
 */
function patchMacZipDistributionMode(zipPath) {
  const zipName = path.basename(zipPath);
  const entryPath = 'MioSub.app/Contents/Resources/distribution.json';

  const config = {
    mode: 'portable',
    buildTime: new Date().toISOString(),
  };
  const configJson = JSON.stringify(config, null, 2);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'miosub-mac-patch-'));

  try {
    // 1. Extract the signed ZIP
    execSync(`unzip -q "${zipPath}" -d "${tmpDir}"`, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 300_000,
    });

    // 2. Patch distribution.json inside the extracted .app bundle
    const distJsonPath = path.join(tmpDir, entryPath);
    if (!fs.existsSync(distJsonPath)) {
      console.warn(`  ${zipName}: ${entryPath} not found in archive, skipping`);
      return null;
    }
    fs.writeFileSync(distJsonPath, configJson);

    // 3. Re-sign the .app bundle (ad-hoc) to restore the seal.
    //    --deep is deprecated by Apple but acceptable for ad-hoc portable signing.
    //    It recursively signs all nested Mach-O binaries (dylibs, helpers).
    const appPath = path.join(tmpDir, 'MioSub.app');
    execSync(`codesign --force --deep -s - "${appPath}"`, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120_000,
    });

    // 4. Re-archive with ditto to a temp path first (atomic replace)
    //    If ditto fails, the original ZIP survives intact.
    const tmpZipPath = zipPath + '.tmp';
    execSync(
      `cd "${tmpDir}" && ditto -c -k --sequesterRsrc --keepParent MioSub.app "${tmpZipPath}"`,
      { stdio: ['pipe', 'pipe', 'pipe'], timeout: 300_000 },
    );
    fs.renameSync(tmpZipPath, zipPath);

    console.log(`Patched ${zipName}: distribution mode → portable (extract → re-sign → re-archive)`);

    // 5. Calculate new SHA512 hash
    const fileBuffer = fs.readFileSync(zipPath);
    const sha512 = crypto.createHash('sha512').update(fileBuffer).digest('base64');
    const size = fileBuffer.length;

    console.log(`  New SHA512: ${sha512.substring(0, 20)}...`);
    return { sha512, size };
  } catch (err) {
    console.error(`Failed to patch ${zipName}:`, err.message);
    if (err.stderr) console.error(`  stderr: ${err.stderr.toString()}`);
    return null;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    // Clean up temp ZIP if atomic replace didn't complete
    try { fs.unlinkSync(zipPath + '.tmp'); } catch {}
  }
}

/**
 * Patch ZIP on Windows using PowerShell's System.IO.Compression.
 * Updates only the target entry without rewriting the entire archive.
 */
function patchZipWindows(zipPath, entryPath, configJson) {
  // Write a temp .ps1 script to avoid escaping issues
  const tmpScript = path.join(os.tmpdir(), `miosub-patch-${Date.now()}.ps1`);
  const normalizedZipPath = zipPath.replace(/\\/g, '\\\\');
  const normalizedEntryPath = entryPath.replace(/\\/g, '/');

  const ps1 = `
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zipPath = "${normalizedZipPath}"
$entryPath = "${normalizedEntryPath}"
$content = @"
${configJson}
"@

$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Update)
try {
    # Remove existing entry if present
    $existing = $zip.GetEntry($entryPath)
    if ($existing) {
        $existing.Delete()
    }
    # Add updated entry
    $newEntry = $zip.CreateEntry($entryPath, [System.IO.Compression.CompressionLevel]::Optimal)
    $writer = New-Object System.IO.StreamWriter($newEntry.Open())
    $writer.Write($content)
    $writer.Close()
} finally {
    $zip.Dispose()
}
`;

  fs.writeFileSync(tmpScript, ps1, 'utf8');
  try {
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpScript}"`, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } finally {
    fs.unlinkSync(tmpScript);
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
