import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// 翻译资源
import zhCN from './locales/zh-CN';
import enUS from './locales/en-US';
import jaJP from './locales/ja-JP';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': zhCN,
      'en-US': enUS,
      'ja-JP': jaJP,
    },
    fallbackLng: 'zh-CN',
    defaultNS: 'common',
    interpolation: {
      escapeValue: false, // React 已自动转义
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

// Sync language changes to main process (Electron only)
i18n.on('languageChanged', (lng) => {
  const electronAPI = (window as any).electronAPI;
  if (electronAPI?.i18n?.changeLanguage) {
    electronAPI.i18n.changeLanguage(lng).catch((err: Error) => {
      console.warn('[i18n] Failed to sync language to main process:', err);
    });
  }
});

export default i18n;
