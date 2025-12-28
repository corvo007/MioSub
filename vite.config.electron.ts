import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'electron/locales/*',
          dest: 'locales',
        },
      ],
    }),
  ],
  build: {
    ssr: true,
    sourcemap: 'inline',
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
    // eslint-disable-next-line no-undef
    'process.env.DEBUG_BUILD': JSON.stringify(process.env.DEBUG_BUILD || 'false'),
  },
});
