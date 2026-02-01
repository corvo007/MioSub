import '../global.css';
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'MioSub - AI Subtitle Editor',
    template: '%s | MioSub',
  },
  description:
    'MioSub is an AI-powered subtitle editor that understands context. Auto-generate, translate, and sync subtitles with Gemini AI. Support 100+ languages, millisecond-precise timing, speaker recognition, and one-click video hardcoding. Free alternative to CapCut, VEED, Descript.',
  keywords: [
    // Primary English
    'AI subtitle generator',
    'automatic subtitles',
    'video translation software',
    'Gemini AI translation',
    'subtitle editor',
    'speech to text',
    'video transcription',
    'bilingual subtitles',
    'auto caption generator',
    // Platform specific
    'YouTube auto captions',
    'YouTube subtitle download',
    'Bilibili subtitle tool',
    // Technical
    'whisper transcription',
    'forced alignment',
    'subtitle timing sync',
    'SRT editor',
    'ASS subtitle editor',
    'hardcoded subtitles',
    // Use cases
    'fansub tool',
    'anime subtitle maker',
    'video localization',
    'podcast transcription',
    // Competitor alternatives
    'CapCut alternative',
    'VEED alternative',
    'Descript alternative',
    'free subtitle generator',
    // 中文核心关键词
    'AI字幕生成器',
    '自动字幕',
    '视频翻译软件',
    '双语字幕',
    '字幕编辑器',
    '语音转文字',
    '智能字幕',
    // 中文平台关键词
    'YouTube字幕下载',
    'B站字幕工具',
    '哔哩哔哩字幕',
    '短视频字幕',
    // 中文技术关键词
    'Whisper语音识别',
    '强制对齐',
    '字幕时间轴',
    '毫秒级对齐',
    '字幕压制',
    '硬字幕',
    // 中文场景关键词
    '字幕组工具',
    '番剧翻译',
    '动漫字幕',
    '电影字幕',
    '日语翻译',
    '播客转录',
    // 中文竞品关键词
    '免费字幕生成',
    '剪映替代',
  ],
  authors: [{ name: 'Corvo007' }],
  creator: 'Corvo007',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    alternateLocale: 'zh_CN',
    title: 'MioSub - AI Subtitle Editor That Understands Context',
    description:
      'Generate, translate, and sync subtitles automatically with AI. Support 100+ languages, millisecond timing, speaker recognition. Free CapCut/VEED alternative.',
    siteName: 'MioSub',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MioSub - AI Subtitle Editor',
    description:
      'AI-powered subtitle generation with context awareness. Auto-translate, sync, and hardcode subtitles. Free alternative to CapCut & VEED.',
  },
  icons: {
    icon: '/icon.png',
    apple: '/icon.png',
  },
  robots: {
    index: true,
    follow: true,
  },
};

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
      <head>
        <Script src="//sdk.51.la/js-sdk-pro.min.js" id="LA_COLLECT" strategy="beforeInteractive" />
        <Script id="la-init" strategy="beforeInteractive">
          {`LA.init({id:"3OsYmsqZ2WlnOM4o",ck:"3OsYmsqZ2WlnOM4o",autoTrack:true,hashMode:true})`}
        </Script>
      </head>
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
