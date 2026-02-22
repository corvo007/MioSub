#!/usr/bin/env node
/**
 * Binary download script for MioSub
 * Downloads platform-specific binaries to resources/ directory
 *
 * Usage:
 *   node scripts/download-binaries.mjs [--force] [--platform=<platform>]
 *
 * Environment variables:
 *   SKIP_BINARY_DOWNLOAD=true  - Skip download entirely
 *   BINARY_PLATFORM=<platform> - Override platform detection (e.g., linux-x64)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { execSync } from 'child_process';

import { BINARIES, EXPECTED_FILES, KEEP_FILES, REQUIRED_FILES } from './binary-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const RESOURCES_DIR = path.join(ROOT_DIR, 'resources');
const TEMP_DIR = path.join(ROOT_DIR, '.binary-cache');

// Parse command line arguments
const args = process.argv.slice(2);
const forceDownload = args.includes('--force');
const platformArg = args.find((a) => a.startsWith('--platform='));
const overridePlatform = platformArg ? platformArg.split('=')[1] : null;

// Detect platform
function getPlatform() {
  if (process.env.BINARY_PLATFORM) return process.env.BINARY_PLATFORM;
  if (overridePlatform) return overridePlatform;

  const platform = process.platform;
  const arch = process.arch;

  const platformMap = {
    'win32-x64': 'win32-x64',
    'linux-x64': 'linux-x64',
    'linux-arm64': 'linux-arm64',
    'darwin-x64': 'darwin-x64',
    'darwin-arm64': 'darwin-arm64',
  };

  const key = `${platform}-${arch}`;
  if (!platformMap[key]) {
    console.error(`Unsupported platform: ${key}`);
    console.error('Supported platforms: win32-x64, linux-x64, linux-arm64, darwin-x64, darwin-arm64');
    process.exit(1);
  }

  return platformMap[key];
}

// Download file with retry
async function downloadFile(url, destPath, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`  Downloading: ${url}`);
      const response = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'MioSub-Binary-Downloader/1.0' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const fileStream = createWriteStream(destPath);
      await pipeline(response.body, fileStream);
      return true;
    } catch (error) {
      console.error(`  Attempt ${attempt}/${retries} failed: ${error.message}`);
      if (attempt === retries) throw error;
      // Exponential backoff
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    }
  }
}

// Extract zip file using adm-zip
async function extractZip(archivePath, destDir, extractRules) {
  const AdmZip = (await import('adm-zip')).default;
  const zip = new AdmZip(archivePath);
  const entries = zip.getEntries();

  if (extractRules.extractAll) {
    // Extract all files
    for (const entry of entries) {
      if (!entry.isDirectory) {
        const fileName = path.basename(entry.entryName);
        const destPath = path.join(destDir, fileName);
        fs.writeFileSync(destPath, entry.getData());
        console.log(`    Extracted: ${fileName}`);
      }
    }
  } else if (extractRules.extract) {
    // Extract specific files
    for (const rule of extractRules.extract) {
      const entry = entries.find((e) => e.entryName === rule.from || e.entryName.endsWith('/' + rule.from));
      if (entry) {
        const destPath = path.join(destDir, rule.to);
        fs.writeFileSync(destPath, entry.getData());
        console.log(`    Extracted: ${rule.to}`);
      } else {
        console.warn(`    Warning: ${rule.from} not found in archive`);
      }
    }
  } else if (extractRules.to) {
    // Single file extraction (for darwin-arm64 ffmpeg/ffprobe)
    const entry = entries.find((e) => !e.isDirectory);
    if (entry) {
      const destPath = path.join(destDir, extractRules.to);
      fs.writeFileSync(destPath, entry.getData());
      console.log(`    Extracted: ${extractRules.to}`);
    }
  }
}

// Extract tar.gz or tar.xz using tar command
async function extractTar(archivePath, destDir, extractRules) {
  const tempExtractDir = path.join(TEMP_DIR, 'tar-extract-' + Date.now());
  fs.mkdirSync(tempExtractDir, { recursive: true });

  try {
    // Determine tar flags based on compression
    const isXz = archivePath.endsWith('.xz');
    const tarFlags = isXz ? '-xJf' : '-xzf';

    execSync(`tar ${tarFlags} "${archivePath}" -C "${tempExtractDir}"`, { stdio: 'pipe' });

    if (extractRules.extractAll) {
      // Find and copy all files
      const files = getAllFiles(tempExtractDir);
      for (const file of files) {
        const fileName = path.basename(file);
        const destPath = path.join(destDir, fileName);
        fs.copyFileSync(file, destPath);
        console.log(`    Extracted: ${fileName}`);
      }
    } else if (extractRules.extract) {
      // Extract specific files
      for (const rule of extractRules.extract) {
        const sourcePath = findFile(tempExtractDir, rule.from);
        if (sourcePath) {
          const destPath = path.join(destDir, rule.to);
          fs.copyFileSync(sourcePath, destPath);
          console.log(`    Extracted: ${rule.to}`);
        } else {
          console.warn(`    Warning: ${rule.from} not found in archive`);
        }
      }
    }
  } finally {
    fs.rmSync(tempExtractDir, { recursive: true, force: true });
  }
}

// Extract 7z using 7z command (requires 7z installed)
async function extract7z(archivePath, destDir, outputName) {
  const tempExtractDir = path.join(TEMP_DIR, '7z-extract-' + Date.now());
  fs.mkdirSync(tempExtractDir, { recursive: true });

  try {
    // Try different 7z commands
    const commands = ['7z', '7za', '7zz'];
    let success = false;

    for (const cmd of commands) {
      try {
        execSync(`${cmd} x "${archivePath}" -o"${tempExtractDir}" -y`, { stdio: 'pipe' });
        success = true;
        break;
      } catch {
        continue;
      }
    }

    if (!success) {
      throw new Error('7z not found. Please install p7zip or 7-zip.');
    }

    // Find the extracted file and copy to destination
    const files = getAllFiles(tempExtractDir);
    if (files.length > 0) {
      const destPath = path.join(destDir, outputName);
      fs.copyFileSync(files[0], destPath);
      console.log(`    Extracted: ${outputName}`);
    }
  } finally {
    fs.rmSync(tempExtractDir, { recursive: true, force: true });
  }
}

// Helper: Get all files recursively
function getAllFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

// Helper: Find file by name in directory tree
function findFile(dir, fileName) {
  const files = getAllFiles(dir);
  return files.find((f) => f.endsWith(path.sep + fileName) || path.basename(f) === fileName);
}

// Set executable permission on Unix
function setExecutable(filePath) {
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(filePath, 0o755);
    } catch {
      // Ignore permission errors
    }
  }
}

// Process a single binary configuration
async function processBinary(name, config, platform) {
  console.log(`\n[${name}]`);

  // Handle multiple URLs (e.g., darwin ffmpeg/ffprobe)
  if (config.urls) {
    for (const item of config.urls) {
      const archiveName = path.basename(new URL(item.url).pathname);
      const archivePath = path.join(TEMP_DIR, archiveName);

      // Check if output already exists
      const outputPath = path.join(RESOURCES_DIR, item.to);
      if (!forceDownload && fs.existsSync(outputPath)) {
        console.log(`  Skipping ${item.to} (already exists)`);
        continue;
      }

      await downloadFile(item.url, archivePath);

      if (item.type === 'zip') {
        await extractZip(archivePath, RESOURCES_DIR, { to: item.to });
      } else if (item.type === '7z') {
        await extract7z(archivePath, RESOURCES_DIR, item.to);
      }

      setExecutable(outputPath);
    }
    return;
  }

  // Handle single URL
  const archiveName = path.basename(new URL(config.url).pathname);
  const archivePath = path.join(TEMP_DIR, archiveName);

  // For binary type, check if output exists
  if (config.type === 'binary') {
    const outputPath = path.join(RESOURCES_DIR, config.to);
    if (!forceDownload && fs.existsSync(outputPath)) {
      console.log(`  Skipping ${config.to} (already exists)`);
      return;
    }

    await downloadFile(config.url, outputPath);
    setExecutable(outputPath);
    console.log(`    Saved: ${config.to}`);
    return;
  }

  // For archives, check if any expected output exists
  if (!forceDownload) {
    const expectedFiles = config.extract?.map((r) => r.to) || [];
    // For extractAll, check all required files from REQUIRED_FILES config
    if (config.extractAll) {
      const requiredFiles = REQUIRED_FILES[name]?.[platform] || [];
      if (requiredFiles.length > 0) {
        const allExist = requiredFiles.every((f) => fs.existsSync(path.join(RESOURCES_DIR, f)));
        if (allExist) {
          console.log(`  Skipping (all required files already exist)`);
          return;
        }
      } else {
        // Fallback: check main executable only
        const mainExe = process.platform === 'win32' ? `${name}.exe` : name;
        if (fs.existsSync(path.join(RESOURCES_DIR, mainExe))) {
          console.log(`  Skipping (${mainExe} already exists)`);
          return;
        }
      }
    } else if (expectedFiles.length > 0) {
      const allExist = expectedFiles.every((f) => fs.existsSync(path.join(RESOURCES_DIR, f)));
      if (allExist) {
        console.log(`  Skipping (all files already exist)`);
        return;
      }
    }
  }

  await downloadFile(config.url, archivePath);

  // Extract based on type
  if (config.type === 'zip') {
    await extractZip(archivePath, RESOURCES_DIR, config);
  } else if (config.type === 'tar.gz' || config.type === 'tar.xz') {
    await extractTar(archivePath, RESOURCES_DIR, config);
  }

  // On Linux, ensure versioned soname exists for onnxruntime
  if (platform.startsWith('linux') && name === 'cpp-ort-aligner') {
    const so = path.join(RESOURCES_DIR, 'libonnxruntime.so');
    const so1 = path.join(RESOURCES_DIR, 'libonnxruntime.so.1');
    if (fs.existsSync(so) && !fs.existsSync(so1)) {
      fs.copyFileSync(so, so1);
      console.log(`    Created: libonnxruntime.so.1 (copy of libonnxruntime.so)`);
    }
  }

  // Set executable permissions
  const outputFiles = config.extract?.map((r) => r.to) || [];
  for (const file of outputFiles) {
    const filePath = path.join(RESOURCES_DIR, file);
    if (fs.existsSync(filePath) && !file.endsWith('.dll')) {
      setExecutable(filePath);
    }
  }
}

// Verify all expected files exist
function verifyFiles(platform) {
  const expected = EXPECTED_FILES[platform] || [];
  const missing = [];

  for (const file of expected) {
    const filePath = path.join(RESOURCES_DIR, file);
    if (!fs.existsSync(filePath)) {
      missing.push(file);
    }
  }

  return missing;
}

// Main function
async function main() {
  // Check for skip flag
  if (process.env.SKIP_BINARY_DOWNLOAD === 'true') {
    console.log('SKIP_BINARY_DOWNLOAD is set, skipping binary download.');
    return;
  }

  const platform = getPlatform();
  console.log(`\n========================================`);
  console.log(`MioSub Binary Downloader`);
  console.log(`Platform: ${platform}`);
  console.log(`Force: ${forceDownload}`);
  console.log(`========================================`);

  // Ensure directories exist
  fs.mkdirSync(RESOURCES_DIR, { recursive: true });
  fs.mkdirSync(TEMP_DIR, { recursive: true });

  // Process each binary
  for (const [name, configs] of Object.entries(BINARIES)) {
    const config = configs[platform];
    if (!config) {
      console.log(`\n[${name}] No configuration for ${platform}, skipping.`);
      continue;
    }

    try {
      await processBinary(name, config, platform);
    } catch (error) {
      console.error(`\nError processing ${name}: ${error.message}`);
      process.exit(1);
    }
  }

  // Verify
  console.log(`\n========================================`);
  console.log(`Verification`);
  console.log(`========================================`);

  const missing = verifyFiles(platform);
  if (missing.length > 0) {
    console.error(`\nMissing files:`);
    for (const file of missing) {
      console.error(`  - ${file}`);
    }
    process.exit(1);
  }

  console.log(`All expected binaries are present.`);

  // Cleanup temp directory
  console.log(`\nCleaning up temporary files...`);
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });

  console.log(`\nDone!`);
}

main().catch((error) => {
  console.error(`\nFatal error: ${error.message}`);
  process.exit(1);
});
