#!/usr/bin/env node
/**
 * Post Tool Use Tracker for Windows
 * Tracks edited files for context management
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('readable', () => {
  let chunk;
  while ((chunk = process.stdin.read()) !== null) {
    input += chunk;
  }
});

process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const toolName = data.tool_name || '';
    const filePath = data.tool_input?.file_path || '';
    const sessionId = data.session_id || 'default';

    // Skip if not an edit tool or no file path
    if (!['Edit', 'MultiEdit', 'Write'].includes(toolName) || !filePath) {
      process.exit(0);
    }

    // Skip markdown files
    if (filePath.endsWith('.md') || filePath.endsWith('.markdown')) {
      process.exit(0);
    }

    // Create cache directory
    const cacheDir = path.join(os.homedir(), '.claude', 'tsc-cache', sessionId);
    fs.mkdirSync(cacheDir, { recursive: true });

    // Determine source type
    const relativePath = filePath.replace(projectDir, '').replace(/^[\\\/]/, '');
    let sourceType = 'unknown';

    if (relativePath.startsWith('src')) {
      sourceType = 'renderer';
    } else if (relativePath.startsWith('electron')) {
      sourceType = 'main';
    }

    if (sourceType === 'unknown') {
      process.exit(0);
    }

    // Log edited file
    const logPath = path.join(cacheDir, 'edited-files.log');
    const logEntry = `${Date.now()}:${filePath}:${sourceType}\n`;
    fs.appendFileSync(logPath, logEntry);

    // Update affected types
    const typesPath = path.join(cacheDir, 'affected-types.txt');
    let types = [];
    if (fs.existsSync(typesPath)) {
      types = fs.readFileSync(typesPath, 'utf-8').split('\n').filter(Boolean);
    }
    if (!types.includes(sourceType)) {
      types.push(sourceType);
      fs.writeFileSync(typesPath, types.join('\n'));
    }

    process.exit(0);
  } catch (err) {
    process.exit(0);
  }
});
