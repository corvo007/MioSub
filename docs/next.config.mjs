import { createMDX } from 'fumadocs-mdx/next';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const withMDX = createMDX({
  configPath: join(__dirname, 'source.config.ts'),
});

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: true },
  transpilePackages: ['fumadocs-ui', 'fumadocs-mdx'],
};

export default withMDX(config);
