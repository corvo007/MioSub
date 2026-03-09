/**
 * Electron Main Process i18n Configuration
 * Uses i18next for internationalization (without React bindings)
 */

import i18n from 'i18next';
import path from 'path';
import fs from 'fs';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load locale files synchronously
const zhCN = JSON.parse(fs.readFileSync(path.join(__dirname, 'locales', 'zh-CN.json'), 'utf-8'));
const enUS = JSON.parse(fs.readFileSync(path.join(__dirname, 'locales', 'en-US.json'), 'utf-8'));

void i18n.init({
  resources: {
    'zh-CN': { translation: zhCN },
    'en-US': { translation: enUS },
  },
  lng: 'zh-CN', // Default language, will sync from renderer
  fallbackLng: 'zh-CN',
  interpolation: {
    escapeValue: false,
  },
});

export const t = i18n.t.bind(i18n);
export const changeLanguage = i18n.changeLanguage.bind(i18n);
export default i18n;
