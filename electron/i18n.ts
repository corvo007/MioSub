/**
 * Electron Main Process i18n Configuration
 * Uses i18next for internationalization (without React bindings)
 */

import i18n from 'i18next';
import zhCN from './locales/zh-CN.json';
import enUS from './locales/en-US.json';

i18n.init({
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
