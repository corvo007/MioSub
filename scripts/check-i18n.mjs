
/* eslint-disable no-undef */
/**
 * Check for missing i18n keys in the codebase
 * Usage: node scripts/check-i18n.mjs
 */
import { readFileSync, existsSync, writeFileSync, readdirSync, statSync } from 'fs';
import { globSync } from 'glob';
import path from 'path';

// Chalk colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
};

// --- Configuration ---
const SRC_LOCALES_DIR = 'src/locales';
const ELECTRON_LOCALES_DIR = 'electron/locales';
const REPORT_FILE = 'i18n-report.json';

// Regex
const T_FUNCTION_REGEX = /\bt\(\s*(['"`])([^'`]+)\1/g;
const USE_TRANSLATION_REGEX = /useTranslation\(\s*(?:(['"`])([^'`]+)\1|\[([^\]]+)\])/;

const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/*.d.ts',
  '**/*.test.{ts,tsx}',
  '**/scripts/**',
];

// --- Helpers ---

function flattenKeys(obj, prefix = '') {
  const keys = new Set();
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const newKey = prefix ? `${prefix}.${key}` : key;
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        const nested = flattenKeys(obj[key], newKey);
        nested.forEach(k => keys.add(k));
      } else {
        keys.add(newKey);
      }
    }
  }
  return keys;
}

function getAvailableLanguages() {
  if (!existsSync(SRC_LOCALES_DIR)) return [];
  return readdirSync(SRC_LOCALES_DIR).filter(f => 
    statSync(path.join(SRC_LOCALES_DIR, f)).isDirectory()
  );
}

function loadFrontendLocales(lang) {
  const localeDir = path.join(SRC_LOCALES_DIR, lang);
  if (!existsSync(localeDir)) return {};

  const localeFiles = globSync('*.json', { cwd: localeDir });
  const localeData = {};

  for (const file of localeFiles) {
    const namespace = path.basename(file, '.json');
    try {
      const content = JSON.parse(readFileSync(path.join(localeDir, file), 'utf-8'));
      localeData[namespace] = flattenKeys(content);
    } catch (e) {
      console.error(`${colors.red}Error parsing ${file}: ${e.message}${colors.reset}`);
    }
  }
  return localeData;
}

function loadBackendLocales(lang) {
  const file = path.join(ELECTRON_LOCALES_DIR, `${lang}.json`);
  if (!existsSync(file)) return new Set();
  try {
    const content = JSON.parse(readFileSync(file, 'utf-8'));
    return flattenKeys(content);
  } catch (e) {
    // console.error(`${colors.red}Error parsing backend locale for ${lang}: ${e.message}${colors.reset}`);
    return new Set();
  }
}

// --- Main ---

console.log(`${colors.blue}${colors.bold}🔍 I18n Missing Key Checker (All Languages)${colors.reset}\n`);

// 1. Scan Codebase for Keys
console.log(`${colors.gray}Scanning source files for key usage...${colors.reset}`);
const files = globSync(['src/**/*.{tsx,ts}', 'electron/**/*.{ts,tsx}'], {
  ignore: IGNORE_PATTERNS,
});

const usedKeys = []; // Array of { key, file, line, namespaces, isBackend }

const TRANSLATION_COMPONENT_REGEX = /<Translation\s+ns=(?:['"]([^'"]+)['"]|{['"]([^'"]+)['"]})/;

for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  if (!content.includes('useTranslation') && !content.includes('t(') && !content.includes('<Translation')) continue;

  const isBackend = file.startsWith('electron');
  
  // Determine Context
  let namespaces = ['common']; 
  if (!isBackend) {
    const nsMatch = content.match(USE_TRANSLATION_REGEX);
    if (nsMatch) {
      if (nsMatch[2]) namespaces = [nsMatch[2]];
      else if (nsMatch[3]) namespaces = nsMatch[3].split(',').map(s => s.trim().replace(/['"`]/g, ''));
    }
    
    // Also check for <Translation ns="app">
    const compMatch = content.match(TRANSLATION_COMPONENT_REGEX);
    if (compMatch) {
        const ns = compMatch[1] || compMatch[2];
        if (ns && !namespaces.includes(ns)) {
            namespaces.push(ns);
        }
    }
  }

  let match;
  while ((match = T_FUNCTION_REGEX.exec(content)) !== null) {
    const key = match[2];
    if (key.includes('${') || key.includes('+')) continue;

    const lines = content.substring(0, match.index).split('\n');
    usedKeys.push({
      key,
      file,
      line: lines.length,
      namespaces,
      isBackend
    });
  }
}

console.log(`${colors.green}✓ Found ${usedKeys.length} key usages in ${files.length} files.${colors.reset}\n`);

// 2. Check against each language
const languages = getAvailableLanguages();
console.log(`${colors.gray}Checking languages: ${languages.join(', ')}...${colors.reset}`);

const report = {
  generatedAt: new Date().toISOString(),
  languages: {},
  summary: {
    totalUsages: usedKeys.length,
    missingCount: 0
  }
};

let totalMissing = 0;

for (const lang of languages) {
  console.log(`${colors.blue}Checking ${lang}...${colors.reset}`);
  
  const frontendKeys = loadFrontendLocales(lang);
  const frontendNamespaces = Object.keys(frontendKeys);
  const backendKeys = loadBackendLocales(lang);
  
  const missing = [];

  for (const usage of usedKeys) {
    const { key, namespaces, isBackend, file, line } = usage;
    let exists = false;
    let suggestion = null;

    if (isBackend) {
      if (backendKeys.has(key)) exists = true;
    } else {
      // Frontend Logic
      let keyNs = namespaces[0];
      let keyPath = key;
      if (key.includes(':')) {
        const parts = key.split(':');
        keyNs = parts[0];
        keyPath = parts.slice(1).join('.');
      }

      // Check Target NS
      if (frontendKeys[keyNs] && frontendKeys[keyNs].has(keyPath)) {
        exists = true;
      } else {
        // Fallback: Declared NS
        for (const ns of namespaces) {
          if (frontendKeys[ns] && frontendKeys[ns].has(keyPath)) {
            exists = true; 
            break;
          }
        }
        // Fallback: Common
        if (!exists && frontendKeys['common']?.has(keyPath)) {
          exists = true;
        }
        // Suggestion search
        if (!exists) {
          for (const ns of frontendNamespaces) {
            if (frontendKeys[ns].has(keyPath)) {
              suggestion = ns;
              break;
            }
          }
        }
      }
    }

    if (!exists) {
        missing.push({
          key,
          file: path.relative('.', file).replace(/\\/g, '/'),
          line,
          suggestion: suggestion || undefined,
          context: isBackend ? 'backend' : 'frontend'
        });
    }
  }

  if (missing.length > 0) {
    console.log(`${colors.yellow}  ⚠️  ${missing.length} missing keys in ${lang}${colors.reset}`);
    
    // Group by file for better readability
    const byFile = {};
    for (const m of missing) {
      if (!byFile[m.file]) byFile[m.file] = [];
      byFile[m.file].push(m);
    }
    
    for (const [file, keys] of Object.entries(byFile)) {
      console.log(`${colors.gray}    📁 ${file}${colors.reset}`);
      for (const k of keys) {
        const suggestionText = k.suggestion ? ` ${colors.cyan}(found in: ${k.suggestion})${colors.reset}` : '';
        console.log(`${colors.red}       L${k.line}: ${k.key}${colors.reset}${suggestionText}`);
      }
    }
    
    totalMissing += missing.length;
  } else {
    console.log(`${colors.green}  ✓ All good${colors.reset}`);
  }

  report.languages[lang] = {
    missingCount: missing.length,
    missingKeys: missing
  };
}

report.summary.missingCount = totalMissing;

// 3. Output Report
writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
console.log(`\n${colors.cyan}📝 Report saved to ${REPORT_FILE}${colors.reset}`);

if (totalMissing > 0) {
  console.log(`${colors.red}${colors.bold}Found ${totalMissing} missing translations across all languages.${colors.reset}`);
  process.exit(1);
} else {
  console.log(`${colors.green}${colors.bold}✨ All translations present!${colors.reset}`);
  process.exit(0);
}
