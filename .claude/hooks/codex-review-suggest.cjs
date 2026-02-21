#!/usr/bin/env node
/**
 * Codex Review Suggest — Stop hook (two-phase)
 *
 * Phase 1: edited-files.log → .pending  (full suggestion)
 * Phase 2: .pending → .processed        (brief reminder)
 *
 * This ensures suggestions survive context compaction — each gets TWO chances.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Drain stdin (required by hook protocol)
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('readable', () => {
  let chunk;
  while ((chunk = process.stdin.read()) !== null) input += chunk;
});

process.stdin.on('end', () => {
  try {
    const cacheBase = path.join(os.homedir(), '.claude', 'tsc-cache');
    if (!fs.existsSync(cacheBase)) process.exit(0);

    const SKIP_EXTS = new Set([
      '.md', '.markdown', '.txt', '.rst', '.adoc', '.pdf', '.doc', '.docx',
      '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.env',
      '.properties', '.plist', '.xml',
      '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.bmp', '.avif',
      '.mp3', '.wav', '.ogg', '.flac', '.mp4', '.webm', '.avi', '.mkv',
      '.woff', '.woff2', '.ttf', '.eot', '.otf',
      '.zip', '.tar', '.gz', '.7z', '.rar', '.bz2',
      '.map', '.lock', '.log', '.pid',
      '.exe', '.dll', '.so', '.dylib', '.bin', '.dat', '.db', '.sqlite',
      '.pem', '.crt', '.key', '.p12',
    ]);
    const SKIP_DIRS = ['locales', 'i18n', 'translations', 'assets', 'images',
      'fonts', 'static', 'public', 'node_modules', 'dist', 'build', '.git'];

    const projectDir = (process.env.CLAUDE_PROJECT_DIR || process.cwd()).replace(/\\/g, '/');

    /** Parse log content into a Set of file paths */
    function parseLog(content) {
      const files = new Set();
      for (const line of content.split('\n')) {
        if (!line.trim()) continue;
        const parts = line.split(':');
        if (parts.length < 3) continue;
        const filePath = parts.slice(1, -1).join(':');
        const ext = path.extname(filePath).toLowerCase();
        if (SKIP_EXTS.has(ext)) continue;
        const normalized = filePath.replace(/\\/g, '/');
        if (SKIP_DIRS.some(d => normalized.includes('/' + d + '/'))) continue;
        files.add(filePath);
      }
      return files;
    }

    /** Convert absolute paths to relative */
    function toRelative(files) {
      return [...files].map(f => {
        const norm = f.replace(/\\/g, '/');
        return norm.startsWith(projectDir)
          ? norm.slice(projectDir.length).replace(/^\//, '')
          : f;
      });
    }

    // Phase 1: fresh logs → .pending
    const newFiles = new Set();
    const freshLogs = [];
    // Phase 2: pending logs → .processed
    const pendingFiles = new Set();
    const pendingLogs = [];

    for (const dir of fs.readdirSync(cacheBase)) {
      const base = path.join(cacheBase, dir, 'edited-files');

      // Check for fresh log
      const logPath = base + '.log';
      if (fs.existsSync(logPath)) {
        const content = fs.readFileSync(logPath, 'utf-8').trim();
        if (content) {
          for (const f of parseLog(content)) newFiles.add(f);
          freshLogs.push(logPath);
        } else {
          // Empty log, just remove
          fs.unlinkSync(logPath);
        }
        continue; // Don't also check .pending in same dir
      }

      // Check for pending log (second chance)
      const pendingPath = base + '.log.pending';
      if (fs.existsSync(pendingPath)) {
        const content = fs.readFileSync(pendingPath, 'utf-8').trim();
        if (content) {
          for (const f of parseLog(content)) pendingFiles.add(f);
          pendingLogs.push(pendingPath);
        } else {
          fs.unlinkSync(pendingPath);
        }
      }
    }

    // Phase 1: promote fresh → pending, output full suggestion
    if (newFiles.size > 0) {
      for (const logPath of freshLogs) {
        fs.renameSync(logPath, logPath + '.pending');
      }
      const rel = toRelative(newFiles);
      console.log('📋 CODEX REVIEW SUGGESTION');
      console.log(`Files edited this session (${rel.length}):`);
      for (const p of rel) console.log(`  - ${p}`);
      console.log('');
      console.log('Evaluate whether these changes warrant a Codex review.');
      console.log('If non-trivial, run: /codex-review');
      console.log('If trivial (comments-only, formatting, typos, single rename), skip and inform the user.');
      // Also retire any pending from previous cycles
      for (const p of pendingLogs) {
        fs.renameSync(p, p.replace('.pending', '.processed'));
      }
      process.exit(0);
    }

    // Phase 2: promote pending → processed, output brief reminder
    if (pendingFiles.size > 0) {
      for (const p of pendingLogs) {
        fs.renameSync(p, p.replace('.pending', '.processed'));
      }
      const rel = toRelative(pendingFiles);
      console.log('📋 CODEX REVIEW REMINDER');
      console.log(`${rel.length} file(s) still pending review:`);
      for (const p of rel) console.log(`  - ${p}`);
      console.log('');
      console.log('Run /codex-review if these changes are non-trivial.');
      process.exit(0);
    }

    // Nothing to suggest
  } catch (err) {
    // Never block Claude
  }
  process.exit(0);
});
