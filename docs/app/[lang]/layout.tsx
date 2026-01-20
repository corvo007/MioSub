import '../global.css';
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export default async function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang?: string }>;
}) {
  const { lang } = await params;
  const locale = lang || 'zh';

  return (
    <html lang={locale} className={inter.className} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <RootProvider
          i18n={{
            locale,
            locales: [
              { locale: 'zh', name: '中文' },
              { locale: 'en', name: 'English' },
            ],
          }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
