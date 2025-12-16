import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

import fs from 'fs';

const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: './',
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      viteStaticCopy({
        targets: [
          {
            src: 'node_modules/onnxruntime-web/dist/ort.min.js',
            dest: '.',
          },
          {
            src: 'node_modules/@ricky0123/vad-web/dist/bundle.min.js',
            dest: '.',
            rename: 'vad.bundle.min.js',
          },
          {
            src: 'node_modules/onnxruntime-web/dist/*.wasm',
            dest: '.',
          },
          {
            src: 'node_modules/onnxruntime-web/dist/*.mjs',
            dest: '.',
          },
          {
            src: 'node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js',
            dest: '.',
          },
          {
            src: 'node_modules/@ricky0123/vad-web/dist/*.onnx',
            dest: '.',
          },
        ],
      }),
    ],
    build: {
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
