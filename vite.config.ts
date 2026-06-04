import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';

import fs from 'fs';

const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: './',
    server: {
      // Port is above Windows' ephemeral range (1024-14999 on this machine),
      // so the proxy/ephemeral allocator can't randomly grab it out from under
      // the dev server. Keep it in sync with electron:dev's `wait-on` URL and
      // electron/main.ts (loadURL + will-navigate allow-list).
      port: 24678,
      host: '0.0.0.0',
      // Fail loudly if the port is taken instead of silently drifting to the
      // next one. electron:dev's `wait-on` watches a fixed port, so a silent
      // change would leave it polling forever and Electron would never launch.
      strictPort: true,
    },
    plugins: [
      react({
        babel: {
          plugins: [['babel-plugin-react-compiler', { target: '19' }]],
        },
      }),
      // Sentry source maps upload (only in CI with env vars)
      env.SENTRY_AUTH_TOKEN
        ? sentryVitePlugin({
            org: env.SENTRY_ORG,
            project: env.SENTRY_PROJECT,
            authToken: env.SENTRY_AUTH_TOKEN,
            release: {
              name: packageJson.version,
            },
            sourcemaps: {
              filesToDeleteAfterUpload: ['./dist/**/*.map'],
            },
          })
        : null,
    ].filter(Boolean),
    build: {
      sourcemap: true,
      rollupOptions: {
        external: [
          'electron',
          'fluent-ffmpeg',
          'ffmpeg-static',
          'ffprobe-static',
          'electron-squirrel-startup',
          'path',
          'fs',
          'child_process',
        ],
        output: {
          manualChunks: {
            // React core
            'vendor-react': ['react', 'react-dom'],
            // UI components & virtualization
            'vendor-ui': ['react-virtuoso', 'lucide-react', 'react-colorful', 'react-rnd', 'assjs'],
            // Internationalization
            'vendor-i18n': ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
            // AI SDKs
            'vendor-ai': ['@google/genai', 'openai', '@anthropic-ai/sdk'],
            // State & utilities
            'vendor-utils': ['zustand', 'clsx', 'tailwind-merge', 'uuid', 'jsonrepair', 'p-map'],
            // JSON viewer (large component, rarely used)
            'vendor-json': ['@uiw/react-json-view'],
          },
        },
      },
    },
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.OPENAI_API_KEY': JSON.stringify(env.OPENAI_API_KEY),
      __APP_VERSION__: JSON.stringify(packageJson.version),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@components': path.resolve(__dirname, './src/components'),
        '@services': path.resolve(__dirname, './src/services'),
        '@hooks': path.resolve(__dirname, './src/hooks'),
        '@utils': path.resolve(__dirname, './src/utils'),
        '@types': path.resolve(__dirname, './src/types'),
        '@constants': path.resolve(__dirname, './src/constants'),
        '@electron': path.resolve(__dirname, './electron'),
      },
    },
  };
});
