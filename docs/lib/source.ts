import { docs, meta } from '@/.source/server';
import { toFumadocsSource } from 'fumadocs-mdx/runtime/server';
import { loader } from 'fumadocs-core/source';
import { i18n } from './i18n';

export const source = loader({
  baseUrl: '/docs',
  source: toFumadocsSource(docs, meta),
  i18n,
});
