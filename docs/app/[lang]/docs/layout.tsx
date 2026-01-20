import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import { source } from '@/lib/source';
import { i18n } from '@/lib/i18n';

export default async function RootDocsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  return (
    <DocsLayout tree={source.getPageTree(lang)} nav={{ title: 'MioSub Docs' }} i18n={i18n}>
      {children}
    </DocsLayout>
  );
}
