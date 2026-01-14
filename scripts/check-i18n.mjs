
/* eslint-disable no-undef */
/**
 * Check for missing and unused i18n keys in the codebase
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

// --- CLI Arguments ---
const args = process.argv.slice(2);
const checkMissing = args.includes('--check-missing') || !args.includes('--check-unused');
const checkUnused = args.includes('--check-unused') || !args.includes('--check-missing');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: node scripts/check-i18n.mjs [options]

Options:
  --check-missing   Only check for missing keys
  --check-unused    Only check for unused keys
  --help, -h        Show this help message

Default behavior (no args) runs both checks.
`);
  process.exit(0);
}

// Regex
const T_FUNCTION_REGEX = /\bt\(\s*(['"`])([^'`]+)\1/g;
const USE_TRANSLATION_REGEX = /useTranslation\(\s*(?:(['"`])([^'`]+)\1|\[([^\]]+)\])/;

// Dynamic Pattern Prefixes to Ignore
const DYNAMIC_PREFIXES = [
  'progress.stages.',
  'progress.chunkLabels.',
  'genre.',
  'encoderSelector.',
  'fileFilter.',
  'errors.'
];

const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/*.d.ts',
  '**/*.test.{ts,tsx}',
  '**/scripts/**',
];

// --- Helpers ---
// Normalize path separators to forward slash
function normalizePath(p) {
  return p.split(path.sep).join('/');
}

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

console.log(`${colors.blue}${colors.bold}🔍 I18n Key Checker (Missing & Unused)${colors.reset}\n`);

// 1. Scan Codebase for Keys
console.log(`${colors.gray}Scanning source files for key usage...${colors.reset}`);
const files = globSync(['src/**/*.{tsx,ts}', 'electron/**/*.{ts,tsx}'], {
  ignore: IGNORE_PATTERNS,
});

const requiredKeys = []; // Strictly used keys (must exist) - via t() or Trans
const potentiallyUsedKeys = new Set(); // Loosely detected keys (prevent unused false positives) - via strings

const TRANSLATION_COMPONENT_REGEX = /<Translation\s+ns=(?:['"]([^'"]+)['"]|{['"]([^'"]+)['"]})/;

for (const rawFile of files) {
  const file = normalizePath(rawFile);
  const content = readFileSync(file, 'utf-8');
  // Allow simple string literals too (for config files)
  if (!content.includes('useTranslation') && 
      !content.includes('t(') && 
      !content.includes('<Translation') && 
      !DYNAMIC_PREFIXES.some(p => content.includes(p))) {
        // Continue checking for loose strings if in backend or potentially config
        // But if completely devoid of i18n markers, we mainly care about loose strings for "unused" prevention
  }

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

  // 1. Check t('key') usage - THESE ARE REQUIRED
  let match;
  while ((match = T_FUNCTION_REGEX.exec(content)) !== null) {
    const key = match[2];
    if (key.includes('${') || key.includes('+')) continue;

    const lines = content.substring(0, match.index).split('\n');
    // Check if key has explicit namespace
    let safeKey = key;
    let explicitNs = null;
    if (key.includes(':')) {
      const parts = key.split(':');
      if (parts.length === 2 && !parts[0].includes(' ')) {
        explicitNs = parts[0];
        safeKey = parts[1];
      }
    }

    requiredKeys.push({
      key: safeKey,
      file,
      line: lines.length,
      namespaces: explicitNs ? [explicitNs] : namespaces,
      isBackend
    });
    // Also add to potential detected set
    if (isBackend) {
      potentiallyUsedKeys.add(`backend:${key}`);
    } else {
      if (explicitNs) {
        potentiallyUsedKeys.add(`${explicitNs}:${safeKey}`);
      } else {
        namespaces.forEach(ns => potentiallyUsedKeys.add(`${ns}:${key}`));
      }
    }
  }

  // 2. Check Static String Usage - THESE ARE JUST POTENTIALLY USED (for unused detection)
  const STRING_REGEX = /['"`]([a-zA-Z0-9_]+\.[a-zA-Z0-9_.]+)['"`]/g;
  while ((match = STRING_REGEX.exec(content)) !== null) {
      const key = match[1];
      // Heuristic: Must contain at least one dot and not be a file path
      if (!key.includes('/') && !key.includes('\\') && key.includes('.')) { 
          // We don't know the namespace for sure, so we add variations or just the key path
          // If detection is loose, we can try to match against ALL namespaces for this key later
          // For now, let's just track the key path itself
          potentiallyUsedKeys.add(`loose:${key}`);
      }
  }
}

console.log(`${colors.green}✓ Found ${requiredKeys.length} explicit key usages in ${files.length} files.${colors.reset}\n`);

// 2. Check against each language
const languages = getAvailableLanguages();
console.log(`${colors.gray}Checking languages: ${languages.join(', ')}...${colors.reset}`);

const report = {
  generatedAt: new Date().toISOString(),
  languages: {},
  summary: {
    totalUsages: requiredKeys.length,
    missingCount: 0,
    unusedCount: 0
  }
};

let totalMissing = 0;
let totalUnused = 0;

// Build a set of all used key patterns (for unused key detection)
// This is already populated in potentiallyUsedKeys but we need to normalize logic
// No specific action needed here as we use potentiallyUsedKeys directly below? 
// Wait, we need to map "requiredKeys" to patterns too just to be sure.
for (const usage of requiredKeys) {
   // Already added to potentiallyUsedKeys during scan
}

for (const lang of languages) {
  console.log(`${colors.blue}Checking ${lang}...${colors.reset}`);
  
  const frontendKeys = loadFrontendLocales(lang);
  const frontendNamespaces = Object.keys(frontendKeys);
  const backendKeys = loadBackendLocales(lang);
  
  const missing = [];

  if (checkMissing) {
    for (const usage of requiredKeys) {
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
      console.log(`${colors.green}  ✓ No missing keys${colors.reset}`);
    }
  }

  // Check for unused keys
  const unused = [];
  if (checkUnused) {
    // Check frontend namespaces
    for (const [ns, keys] of Object.entries(frontendKeys)) {
      for (const keyPath of keys) {
        const fullKey = `${ns}:${keyPath}`;
        // Check if this key is used
        // Checks: 
        // 1. Is explicitly used with namespace?
        // 2. Is loosely found as a string?
        // 3. Is matched by dynamic pattern?
        
        const isUsed = 
           potentiallyUsedKeys.has(fullKey) || 
           potentiallyUsedKeys.has(`loose:${keyPath}`) ||
           potentiallyUsedKeys.has(`loose:${fullKey}`) ||
           // Also check if any loose key ends with this keyPath (e.g. for "ns:key" vs "key")
           // This is expensive so we rely on explicit "loose:${keyPath}" which we added
           false;

        if (!isUsed) {
          // Check dynamic patterns
          const isDynamic = DYNAMIC_PREFIXES.some(prefix => keyPath.startsWith(prefix));
          
          if (!isDynamic) {
             unused.push({
              key: keyPath,
              namespace: ns,
              context: 'frontend',
              file: `src/locales/${lang}/${ns}.json`
            });
          }
        }
      }
    }
    
    // Check backend keys
    for (const keyPath of backendKeys) {
      const isUsed = potentiallyUsedKeys.has(`backend:${keyPath}`) || potentiallyUsedKeys.has(`loose:${keyPath}`);
      
      if (!isUsed) {
          // Check dynamic patterns
          const isDynamic = DYNAMIC_PREFIXES.some(prefix => keyPath.startsWith(prefix));

          if (!isDynamic) {
            unused.push({
              key: keyPath,
              namespace: null,
              context: 'backend',
              file: `electron/locales/${lang}.json`
            });
         }
      }
    }

    if (unused.length > 0) {
      console.log(`${colors.magenta}  🗑️  ${unused.length} unused keys${colors.reset}`);
      
      // Group by file/namespace
      const byNs = {};
      for (const u of unused) {
        const group = u.namespace || 'backend';
        if (!byNs[group]) byNs[group] = [];
        byNs[group].push(u);
      }
      
      for (const [ns, keys] of Object.entries(byNs)) {
        console.log(`${colors.gray}    📦 ${ns}${colors.reset}`);
        for (const k of keys) {
          console.log(`${colors.magenta}       ${k.key}${colors.reset}`);
        }
      }
      
      totalUnused += unused.length;
    } else {
      console.log(`${colors.green}  ✓ No unused keys${colors.reset}`);
    }
  }

  report.languages[lang] = {
    missingCount: missing.length,
    missingKeys: missing,
    unusedCount: unused.length,
    unusedKeys: unused
  };
}

report.summary.missingCount = totalMissing;
report.summary.unusedCount = totalUnused;

// 3. Output Report
writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
console.log(`\n${colors.cyan}📝 Report saved to ${REPORT_FILE}${colors.reset}`);

const hasIssues = (checkMissing && totalMissing > 0) || (checkUnused && totalUnused > 0);
if (hasIssues) {
  if (checkMissing && totalMissing > 0) {
    console.log(`${colors.red}${colors.bold}Found ${totalMissing} missing translations.${colors.reset}`);
  }
  if (checkUnused && totalUnused > 0) {
    console.log(`${colors.magenta}${colors.bold}Found ${totalUnused} unused keys.${colors.reset}`);
  }
  process.exit(1);
} else {
  let msg = '✨ All good!';
  if (checkMissing && checkUnused) msg = '✨ All translations present and no unused keys!';
  else if (checkMissing) msg = '✨ All translations present!';
  else if (checkUnused) msg = '✨ No unused keys detected!';
  
  console.log(`${colors.green}${colors.bold}${msg}${colors.reset}`);
  process.exit(0);
}
