'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Github, ArrowRight, Download, Sparkles, Clock, Target, Layers } from 'lucide-react';
import { motion } from 'framer-motion';

// Brand Colors from miosub_launch_playbook.md
// Primary: #6D28D9 (Electric Purple / 罗兰紫)
// Accent: #F59E0B (Vibrant Orange / 活力橙)
// Background: #F8FAFC (Light) / #0F172A (Dark)

const translations = {
  zh: {
    nav: {
      docs: '📖 文档',
      download: '下载',
    },
    hero: {
      badge: '✨ v3.0 正式发布',
      // 主 Slogan - 分两行显示
      title1: '世界的内容，',
      title2: '你的语言。',
      subtitle: '真正读懂上下文的 AI 字幕编辑器',
      desc: '智能术语提取 · 毫秒级精准对齐 · 语境感知翻译',
      downloadWin: '立即下载 Windows',
      downloadMac: '立即下载 macOS',
      viewDocs: '5分钟上手',
    },
    section: {
      why: '⚡ 为什么选择 MioSub？',
      whyDesc1: '还在逐句校对机翻？还在手动调时间轴？MioSub 用 AI 重新定义字幕工作流——',
      whyDescBold: '一键导入，自动输出影院级字幕',
      whyDesc2: '。从此告别重复劳动，把时间还给创作。',
    },
    features: {
      context: {
        title: '🧠 上下文理解',
        desc: 'Gemini 长上下文加持，先读完全片再落笔翻译，杜绝「断章取义」式的尴尬误译。',
      },
      glossary: {
        title: '📚 智能术语表',
        desc: '一键提取人名、地名、专业术语，全片译名前后一致，告别「张三变李四」。',
      },
      align: {
        title: '🌊 波形级对齐',
        desc: '内置强制对齐算法，时间轴精准到毫秒，每一句台词都「踩在点上」。',
      },
      editor: {
        title: '🎨 所见即所得',
        desc: '边改边看效果，字幕编辑像写文档一样简单——新手也能一分钟上手。',
      },
    },
    showcase: {
      title: '🎬 效果展示',
      demos: [
        {
          type: '🎙️ 声优电台',
          link: 'https://www.bilibili.com/video/BV1XBrsBZE92/',
          desc: '日语 30 分钟，含说话人标注',
        },
        {
          type: '🚃 铁道 vlog',
          link: 'https://www.bilibili.com/video/BV1k1mgBJEEY/',
          desc: '日语 29 分钟，大量专业术语',
        },
        {
          type: '🎬 电影解说',
          link: 'https://www.bilibili.com/video/BV1MG6CBvEzd/',
          desc: 'PJSK 剧场版彩蛋，语速极快、大量专有名词',
        },
      ],
    },
    footer: "Make the world's content yours.",
  },
  en: {
    nav: {
      docs: '📖 Docs',
      download: 'Download',
    },
    hero: {
      badge: '✨ v3.0 Just Launched',
      title1: "World's Content,",
      title2: 'Your Language.',
      subtitle: 'The AI subtitle editor that truly understands context',
      desc: 'Smart Glossary · Waveform Sync · Context-Aware Translation',
      downloadWin: 'Download for Windows',
      downloadMac: 'Download for macOS',
      viewDocs: 'Quick Start',
    },
    section: {
      why: '⚡ Why MioSub?',
      whyDesc1:
        'Still fixing machine translations line by line? Still syncing timecodes manually? MioSub redefines subtitle workflows with AI—',
      whyDescBold: 'one import, cinema-quality subtitles out',
      whyDesc2: '. Reclaim your time for what matters: creating.',
    },
    features: {
      context: {
        title: '🧠 Context-Aware',
        desc: "Powered by Gemini's long context window. Reads the entire video before translating—no more awkward out-of-context errors.",
      },
      glossary: {
        title: '📚 Smart Glossary',
        desc: 'Auto-extracts names, places, and terminology. Keeps every reference consistent from start to finish.',
      },
      align: {
        title: '🌊 Waveform Sync',
        desc: 'Built-in forced alignment with millisecond precision. Every line lands exactly on the beat.',
      },
      editor: {
        title: '🎨 WYSIWYG Editor',
        desc: 'Edit and preview in real-time. Subtitle editing as intuitive as writing a doc—anyone can master it in minutes.',
      },
    },
    showcase: {
      title: '🎬 Demo Showcase',
      demos: [
        {
          type: '🎙️ Voice Actor Radio',
          link: 'https://www.bilibili.com/video/BV1XBrsBZE92/',
          desc: 'Japanese, 30 min, with speaker labels',
        },
        {
          type: '🚃 Railway Vlog',
          link: 'https://www.bilibili.com/video/BV1k1mgBJEEY/',
          desc: 'Japanese, 29 min, technical terminology',
        },
        {
          type: '🎬 Movie Commentary',
          link: 'https://www.bilibili.com/video/BV1MG6CBvEzd/',
          desc: 'PJSK movie easter eggs, fast pace, many proper nouns',
        },
      ],
    },
    footer: "Make the world's content yours.",
  },
};

export default function HomePage() {
  const params = useParams();
  const locale = (params?.lang as string) || 'zh';
  const t = translations[locale as keyof typeof translations] || translations.zh;

  return (
    <div className="flex flex-col min-h-screen bg-transparent text-slate-800 selection:bg-[#6D28D9] selection:text-white overflow-x-hidden font-sans relative">
      {/* Base background color */}
      <div className="fixed inset-0 bg-[#F8FAFC] -z-20" />

      {/* Animated Background - Multiple Distributed Halos */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        {/* Purple halo 1 - top left */}
        <motion.div
          animate={{
            x: [0, 60, 30, -40, 0],
            y: [0, 40, 80, 30, 0],
            opacity: [0.25, 0.35, 0.3, 0.25],
          }}
          transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
          className="absolute -top-20 -left-20 w-[500px] h-[500px] bg-[#6D28D9]/25 rounded-full filter blur-[150px]"
        />
        {/* Orange halo 1 - top right */}
        <motion.div
          animate={{
            x: [0, -50, -80, -30, 0],
            y: [0, 50, 20, -30, 0],
            opacity: [0.25, 0.35, 0.3, 0.25],
          }}
          transition={{ duration: 45, repeat: Infinity, ease: 'linear' }}
          className="absolute -top-10 -right-10 w-[450px] h-[450px] bg-[#F59E0B]/28 rounded-full filter blur-[150px]"
        />
        {/* Purple halo 2 - center */}
        <motion.div
          animate={{
            x: [0, 80, 40, -60, 0],
            y: [0, -50, 60, 20, 0],
            opacity: [0.2, 0.3, 0.25, 0.2],
          }}
          transition={{ duration: 50, repeat: Infinity, ease: 'linear' }}
          className="absolute top-1/3 left-1/3 w-[400px] h-[400px] bg-[#6D28D9]/20 rounded-full filter blur-[150px]"
        />
        {/* Orange halo 2 - center right */}
        <motion.div
          animate={{
            x: [0, -70, 30, 50, 0],
            y: [0, 30, 70, -20, 0],
            opacity: [0.2, 0.3, 0.25, 0.2],
          }}
          transition={{ duration: 55, repeat: Infinity, ease: 'linear' }}
          className="absolute top-1/4 right-1/4 w-[400px] h-[400px] bg-[#F59E0B]/22 rounded-full filter blur-[150px]"
        />
        {/* Purple halo 3 - bottom left */}
        <motion.div
          animate={{
            x: [0, 50, 90, 30, 0],
            y: [0, -40, 20, 50, 0],
            opacity: [0.2, 0.28, 0.24, 0.2],
          }}
          transition={{ duration: 48, repeat: Infinity, ease: 'linear' }}
          className="absolute -bottom-20 -left-10 w-[450px] h-[450px] bg-[#6D28D9]/20 rounded-full filter blur-[150px]"
        />
        {/* Orange halo 3 - bottom right */}
        <motion.div
          animate={{
            x: [0, -60, -20, 40, 0],
            y: [0, -30, -60, 20, 0],
            opacity: [0.18, 0.25, 0.22, 0.18],
          }}
          transition={{ duration: 52, repeat: Infinity, ease: 'linear' }}
          className="absolute -bottom-10 -right-20 w-[400px] h-[400px] bg-[#F59E0B]/20 rounded-full filter blur-[150px]"
        />
      </div>

      {/* Navigation */}
      <header className="w-full px-6 py-4 flex items-center justify-between z-50 relative">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-[#6D28D9] to-purple-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-[#6D28D9]/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <span className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-[#6D28D9] to-[#F59E0B]">
            MioSub
          </span>
        </div>
        <nav className="flex items-center gap-3">
          <Link
            href={locale === 'zh' ? '/docs' : `/${locale}/docs`}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 transition-all text-sm font-semibold text-slate-800"
          >
            {t.nav.docs}
          </Link>
          {/* Language Switcher */}
          <Link
            href={locale === 'zh' ? '/en' : '/'}
            className="px-3 py-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 transition-all text-sm font-semibold text-slate-800"
          >
            {locale === 'zh' ? 'EN' : '中文'}
          </Link>
          {locale === 'zh' && (
            <Link
              href="https://qm.qq.com/cgi-bin/qm/qr?k=qBoSXr8a668tJm80UbPcyvpey8mwfQ2H&jump_from=webapi&authKey=6fQajPs64A/yue/dKEMfZTxBQ8+SBuPugOTA6tC+3CuHW1NyNZFRwomo75sF1zUR"
              target="_blank"
              className="px-3 py-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 transition-all text-sm font-semibold text-slate-800"
            >
              QQ 群
            </Link>
          )}
          <Link
            href="https://github.com/corvo007/Gemini-Subtitle-Pro"
            target="_blank"
            className="p-2 rounded-full bg-slate-200 hover:bg-slate-300 transition-colors"
          >
            <Github className="w-5 h-5 text-slate-600" />
          </Link>
        </nav>
      </header>

      <main className="flex-1 relative z-10">
        {/* Hero Section */}
        <section className="max-w-4xl mx-auto px-6 pt-16 pb-24 text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#6D28D9]/10 border border-[#6D28D9]/20 text-sm font-medium text-[#6D28D9] mb-8"
          >
            {t.hero.badge}
          </motion.div>

          {/* Main Title */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl md:text-7xl font-bold tracking-tight mb-4"
          >
            <span className="bg-gradient-to-r from-[#6D28D9] to-[#F59E0B] bg-clip-text text-transparent">
              {t.hero.title1}
            </span>
            <br />
            <span className="bg-gradient-to-r from-[#6D28D9] to-[#F59E0B] bg-clip-text text-transparent">
              {t.hero.title2}
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl md:text-2xl text-slate-600 mb-2"
          >
            {t.hero.subtitle}
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-base text-slate-500 mb-10"
          >
            {t.hero.desc}
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="flex flex-wrap items-center justify-center gap-4"
          >
            <Link
              href={
                locale === 'zh'
                  ? '/docs/guide#第一步下载安装'
                  : '/en/docs/guide#step-1-download--install'
              }
              className="px-10 py-4 rounded-2xl bg-gradient-to-r from-[#6D28D9] to-purple-500 text-white text-lg font-bold hover:brightness-110 transition-all shadow-xl shadow-[#6D28D9]/30 flex items-center gap-3 group"
            >
              <Download className="w-5 h-5" />
              {locale === 'zh' ? '立即下载' : 'Download Now'}
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href={locale === 'zh' ? '/docs' : `/${locale}/docs`}
              className="px-6 py-3 rounded-xl bg-white text-slate-900 font-bold hover:bg-slate-50 border border-slate-300 shadow-sm transition-all flex items-center gap-2"
            >
              {t.hero.viewDocs}
            </Link>
          </motion.div>
        </section>

        {/* Why MioSub Section */}
        <section className="max-w-5xl mx-auto px-6 pb-16">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-2xl md:text-3xl font-bold text-slate-800 mb-4">{t.section.why}</h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              {t.section.whyDesc1}
              <strong className="font-bold text-slate-800">{t.section.whyDescBold}</strong>
              {t.section.whyDesc2}
            </p>
          </motion.div>

          {/* Feature Cards - Glass Morphism */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-20"
          >
            {/* Context Aware */}
            <div className="p-6 rounded-2xl bg-white/80 backdrop-blur-2xl backdrop-saturate-150 border border-white/60 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
              <div className="w-14 h-14 rounded-2xl bg-[#6D28D9]/10 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                <div className="w-10 h-10 bg-gradient-to-br from-[#6D28D9] to-purple-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-[#6D28D9]/30">
                  <Sparkles className="w-5 h-5" />
                </div>
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2 group-hover:text-[#6D28D9] transition-colors">
                {t.features.context.title}
              </h3>
              <p className="text-sm text-slate-500">{t.features.context.desc}</p>
            </div>

            {/* Glossary */}
            <div className="p-6 rounded-2xl bg-white/80 backdrop-blur-2xl backdrop-saturate-150 border border-white/60 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
              <div className="w-14 h-14 rounded-2xl bg-[#F59E0B]/10 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                <div className="w-10 h-10 bg-gradient-to-br from-[#F59E0B] to-orange-400 rounded-xl flex items-center justify-center text-white shadow-lg shadow-[#F59E0B]/30">
                  <Layers className="w-5 h-5" />
                </div>
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2 group-hover:text-[#F59E0B] transition-colors">
                {t.features.glossary.title}
              </h3>
              <p className="text-sm text-slate-500">{t.features.glossary.desc}</p>
            </div>

            {/* Alignment */}
            <div className="p-6 rounded-2xl bg-white/80 backdrop-blur-2xl backdrop-saturate-150 border border-white/60 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-400 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-500/30">
                  <Target className="w-5 h-5" />
                </div>
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2 group-hover:text-emerald-500 transition-colors">
                {t.features.align.title}
              </h3>
              <p className="text-sm text-slate-500">{t.features.align.desc}</p>
            </div>

            {/* Editor */}
            <div className="p-6 rounded-2xl bg-white/80 backdrop-blur-2xl backdrop-saturate-150 border border-white/60 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
              <div className="w-14 h-14 rounded-2xl bg-sky-500/10 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                <div className="w-10 h-10 bg-gradient-to-br from-sky-500 to-sky-400 rounded-xl flex items-center justify-center text-white shadow-lg shadow-sky-500/30">
                  <Clock className="w-5 h-5" />
                </div>
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2 group-hover:text-sky-500 transition-colors">
                {t.features.editor.title}
              </h3>
              <p className="text-sm text-slate-500">{t.features.editor.desc}</p>
            </div>
          </motion.div>
        </section>

        {/* Showcase Section - UI Screenshot + Demos */}
        <section className="max-w-5xl mx-auto px-6 pb-20">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-2xl md:text-3xl font-bold text-slate-800 mb-8 text-center">
              {t.showcase.title}
            </h2>

            {/* Demo Links */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
              {t.showcase.demos.map((demo, i) => (
                <a
                  key={i}
                  href={demo.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-5 rounded-xl bg-white/80 backdrop-blur-xl border border-slate-200 shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-lg font-bold text-slate-800 group-hover:text-[#6D28D9] transition-colors">
                      {demo.type}
                    </span>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#6D28D9] group-hover:translate-x-1 transition-all" />
                  </div>
                  <p className="text-sm text-slate-500">{demo.desc}</p>
                </a>
              ))}
            </div>

            {/* UI Screenshot */}
            <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-xl">
              <img
                src={locale === 'zh' ? '/editor.png' : '/editor_en.png'}
                alt="MioSub Interface"
                className="w-full h-auto"
              />
            </div>
          </motion.div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-8 border-t border-slate-200">
        <div className="text-center">
          <p className="text-sm text-slate-400">MioSub • {t.footer}</p>
          <p className="text-xs text-slate-300 mt-1">Made with ❤️</p>
        </div>
      </footer>
    </div>
  );
}
