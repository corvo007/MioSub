import { defineConfig, loadEnv } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { execSync } from 'child_process';
import { sentryVitePlugin } from '@sentry/vite-plugin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));

// Get commit hash for production builds
let commitHash = 'N/A';
try {
  commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
} catch (e) {
  // eslint-disable-next-line no-undef
  console.warn('Failed to get commit hash:', e);
}

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  // eslint-disable-next-line no-undef
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      viteStaticCopy({
        targets: [
          {
            src: 'electron/locales/*',
            dest: 'locales',
          },
          {
            src: 'electron/splash.html',
            dest: '.',
          },
        ],
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
              filesToDeleteAfterUpload: ['./dist-electron/**/*.map'],
            },
          })
        : null,
    ].filter(Boolean),
    build: {
      ssr: true,
      sourcemap: true,
      outDir: 'dist-electron',
      emptyOutDir: true,
      lib: {
        entry: {
          main: path.resolve(__dirname, 'electron/main.ts'),
          preload: path.resolve(__dirname, 'electron/preload.ts'),
        },
        formats: ['cjs'],
      },
      rollupOptions: {
        external: ['electron', 'path', 'fs', 'os', 'child_process'],
        output: {
          entryFileNames: '[name].cjs',
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    define: {
      // Build-time environment variables
      // Note: DEBUG_BUILD comes from CLI (cross-env), others from .env file
      // eslint-disable-next-line no-undef
      'process.env.DEBUG_BUILD': JSON.stringify(process.env.DEBUG_BUILD || 'false'),
      'process.env.COMMIT_HASH': JSON.stringify(commitHash),
      // Analytics API Keys (from .env)
      'process.env.VITE_AMPLITUDE_API_KEY': JSON.stringify(env.VITE_AMPLITUDE_API_KEY || ''),
      'process.env.VITE_MIXPANEL_TOKEN': JSON.stringify(env.VITE_MIXPANEL_TOKEN || ''),
      // Sentry DSN (from .env)
      'process.env.VITE_SENTRY_DSN': JSON.stringify(env.VITE_SENTRY_DSN || ''),
      'process.env.APP_VERSION': JSON.stringify(packageJson.version),
    },
  };
});
