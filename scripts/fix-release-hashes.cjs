/**
 * Fix macOS auto-update yml hashes after CI merge-multiple.
 *
 * Problem: Two separate macOS CI jobs (arm64, x64) each produce a latest-mac.yml.
 * When merge-multiple combines artifacts, one yml overwrites the other.
 * The winning yml has correct hashes for its own arch but STALE hashes for
 * the other arch (because afterAllArtifactBuild only patches local ZIPs).
 *
 * Solution: Recalculate SHA512 for all macOS ZIP files and rebuild the yml.
 *
 * Usage: node scripts/fix-release-hashes.cjs <release-dir>
 *
 * See: MIOSUB-12 (third regression)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const yaml = require('js-yaml');

const releaseDir = process.argv[2];
if (!releaseDir) {
  console.error('Usage: node fix-release-hashes.cjs <release-dir>');
  process.exit(1);
}

fixReleaseHashes(releaseDir);

function fixReleaseHashes(dir) {
  const ymlFiles = fs.readdirSync(dir).filter((f) => f.endsWith('.yml') && !f.includes('blockmap'));

  for (const ymlFile of ymlFiles) {
    const ymlPath = path.join(dir, ymlFile);
    fixYmlFile(ymlPath, dir);
  }
}

function fixYmlFile(ymlPath, dir) {
  const content = fs.readFileSync(ymlPath, 'utf8');
  const data = yaml.load(content);

  if (!data || !data.files) {
    return;
  }

  let updated = false;

  for (const file of data.files) {
    if (!file.url) continue;

    const assetPath = path.join(dir, file.url);
    if (!fs.existsSync(assetPath)) {
      console.warn(`  Warning: ${file.url} not found in ${dir}, skipping`);
      continue;
    }

    const { sha512, size } = calculateHash(assetPath);

    if (file.sha512 !== sha512) {
      console.log(`Fixing ${path.basename(ymlPath)}: ${file.url}`);
      console.log(`  Old SHA512: ${file.sha512.substring(0, 20)}...`);
      console.log(`  New SHA512: ${sha512.substring(0, 20)}...`);
      console.log(`  Old size: ${file.size}, New size: ${size}`);
      file.sha512 = sha512;
      file.size = size;
      updated = true;
    }
  }

  // Fix top-level path/sha512
  if (data.path) {
    const assetPath = path.join(dir, data.path);
    if (fs.existsSync(assetPath)) {
      const { sha512 } = calculateHash(assetPath);
      if (data.sha512 !== sha512) {
        console.log(`Fixing ${path.basename(ymlPath)} top-level sha512`);
        data.sha512 = sha512;
        updated = true;
      }
    }
  }

  if (updated) {
    fs.writeFileSync(ymlPath, yaml.dump(data, { lineWidth: -1 }));
    console.log(`Updated ${path.basename(ymlPath)}`);
  } else {
    console.log(`${path.basename(ymlPath)}: all hashes correct`);
  }
}

function calculateHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const sha512 = crypto.createHash('sha512').update(fileBuffer).digest('base64');
  return { sha512, size: fileBuffer.length };
}
