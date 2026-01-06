#!/usr/bin/env node
/**
 * TSC Check Hook for Windows
 * Runs TypeScript compilation check after Stop event
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Get project directory from environment or current working directory
const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

// Read hook input from stdin (not used for Stop hook but required)
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
    // Check if there are TypeScript files that were edited
    // For now, just run a basic tsc check
    const tsconfigPath = path.join(projectDir, 'tsconfig.json');

    if (!fs.existsSync(tsconfigPath)) {
      process.exit(0);
    }

    console.error('⚡ Running TypeScript check...');

    try {
      execSync('npx tsc --noEmit', {
        cwd: projectDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 60000,
      });
      console.error('✅ TypeScript check passed');
    } catch (error) {
      const output = error.stdout?.toString() || error.stderr?.toString() || '';
      if (output.includes('error TS')) {
        console.error('❌ TypeScript errors found:');
        console.error(output.split('\n').slice(0, 10).join('\n'));
        if (output.split('\n').length > 10) {
          console.error('... and more errors');
        }
        console.error('\n👉 Use auto-error-resolver agent to fix');
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('Error in tsc-check hook:', err.message);
    process.exit(0); // Don't block on errors
  }
});
