import { defineI18n } from 'fumadocs-core/i18n';

export const i18n = defineI18n({
  defaultLanguage: 'zh',
  languages: ['zh', 'en'],
  hideLocale: 'default-locale', // Hide /zh prefix for default language
  parser: 'dir', // Use folder-based i18n (en/ subfolder for English)
});
