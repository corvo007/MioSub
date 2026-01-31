'use client';

import { useEffect, useState } from 'react';

type Platform = 'windows' | 'macos' | 'linux' | 'mobile' | 'unknown';
type Arch = 'x64' | 'arm64' | 'unknown';

// ============ 配置区域 ============
// GitHub Releases 地址
const GITHUB_REPO = 'corvo007/Gemini-Subtitle-Pro';
const GITHUB_RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases`;
const GITHUB_DOWNLOAD_BASE = `https://github.com/${GITHUB_REPO}/releases/latest/download`;

// 中国镜像地址（留空则不显示镜像选项）
// 镜像需要支持 /latest/download/FILENAME 格式
const CHINA_MIRROR_BASE = '';
// 示例: const CHINA_MIRROR_BASE = 'https://mirror.example.com/releases/latest/download';

// 文件名配置
const FILE_NAMES = {
  windows: {
    portable: 'MioSub-win-x64.zip',
    installer: 'MioSub-win-x64-setup.exe',
  },
  macos: {
    arm64: 'MioSub-mac-arm64.dmg',
    x64: 'MioSub-mac-x64.dmg',
  },
  linux: {
    x64: 'MioSub-linux-x64.AppImage',
    arm64: 'MioSub-linux-arm64.AppImage',
  },
};
// ============ 配置结束 ============

function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'unknown';

  const platform = navigator.platform.toLowerCase();
  const userAgent = navigator.userAgent.toLowerCase();

  // 先检测移动设备（在检测 linux 之前，因为 Android UA 包含 linux）
  if (
    userAgent.includes('android') ||
    userAgent.includes('iphone') ||
    userAgent.includes('ipad') ||
    userAgent.includes('ipod') ||
    (userAgent.includes('mobile') && !userAgent.includes('windows'))
  ) {
    return 'mobile';
  }

  // macOS 检测（优先于 Windows，因为 DevTools 模拟时 platform 可能仍是 Win32）
  if (userAgent.includes('macintosh') || userAgent.includes('mac os x')) {
    // iPadOS Safari 伪装成 macOS，但支持多点触控（真正的 Mac 没有触摸屏）
    if (navigator.maxTouchPoints > 1) {
      return 'mobile';
    }
    return 'macos';
  }

  if (platform.includes('win') || userAgent.includes('windows')) {
    return 'windows';
  }
  if (platform.includes('linux') || userAgent.includes('linux')) {
    return 'linux';
  }
  return 'unknown';
}

function detectArch(): Arch {
  if (typeof window === 'undefined') return 'unknown';

  const nav = navigator as Navigator & { userAgentData?: { architecture?: string } };
  if (nav.userAgentData?.architecture) {
    const arch = nav.userAgentData.architecture.toLowerCase();
    if (arch.includes('arm')) return 'arm64';
    return 'x64';
  }

  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes('arm64') || userAgent.includes('aarch64')) {
    return 'arm64';
  }

  if (detectPlatform() === 'macos') {
    return 'unknown';
  }

  return 'x64';
}

function detectIsChina(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // 中国大陆、香港、澳门、台湾时区
    const chinaTimezones = [
      'Asia/Shanghai',
      'Asia/Chongqing',
      'Asia/Harbin',
      'Asia/Urumqi',
      'Asia/Hong_Kong',
      'Asia/Macau',
      'Asia/Taipei',
    ];
    return chinaTimezones.includes(timezone);
  } catch {
    return false;
  }
}

// 生成下载链接
function getDownloadUrl(filename: string, useMirror: boolean): string {
  const base = useMirror && CHINA_MIRROR_BASE ? CHINA_MIRROR_BASE : GITHUB_DOWNLOAD_BASE;
  return `${base}/${filename}`;
}

// 从 URL 参数获取测试用的平台/架构覆盖值
function getUrlOverrides(): { platform?: Platform; arch?: Arch } {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const platform = params.get('platform') as Platform | null;
  const arch = params.get('arch') as Arch | null;
  return {
    platform:
      platform && ['windows', 'macos', 'linux', 'mobile'].includes(platform) ? platform : undefined,
    arch: arch && ['x64', 'arm64'].includes(arch) ? arch : undefined,
  };
}

interface DownloadButtonProps {
  locale?: 'zh' | 'en';
}

export function DownloadButton({ locale = 'zh' }: DownloadButtonProps) {
  const [platform, setPlatform] = useState<Platform>('unknown');
  const [arch, setArch] = useState<Arch>('unknown');
  const [isChina, setIsChina] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const overrides = getUrlOverrides();
    setPlatform(overrides.platform ?? detectPlatform());
    setArch(overrides.arch ?? detectArch());
    setIsChina(detectIsChina());
    setMounted(true);
  }, []);

  const hasMirror = !!CHINA_MIRROR_BASE && isChina;

  const t = {
    zh: {
      detecting: '检测系统中...',
      windows: 'Windows',
      macos: 'macOS',
      linux: 'Linux',
      portable: '便携版',
      portableDesc: '解压即用，无需安装',
      installer: '安装版',
      installerDesc: '标准安装程序',
      dmg: '安装包',
      dmgDesc: '拖拽到 Applications 即可',
      macosNote: '⚠️ 应用未签名，首次打开需右键点击选择「打开」，详见',
      macosNoteLink: '常见问题',
      appimage: 'AppImage',
      appimageDesc: '赋予执行权限后运行',
      intel: 'Intel 芯片',
      apple: 'Apple 芯片',
      allDownloads: '查看所有下载',
      recommendedFor: '推荐',
      mirrorSource: '国内镜像',
      githubSource: 'GitHub 下载',
      mobileTitle: '桌面应用',
      mobileDesc: 'MioSub 是桌面应用，请在电脑上访问此页面下载',
      mobilePlatforms: '支持 Windows、macOS、Linux',
      webDemo: '在线体验',
      webDemoDesc: '体验核心功能，完整功能请使用桌面版',
    },
    en: {
      detecting: 'Detecting system...',
      windows: 'Windows',
      macos: 'macOS',
      linux: 'Linux',
      portable: 'Portable',
      portableDesc: 'Extract and run, no installation',
      installer: 'Installer',
      installerDesc: 'Standard installer',
      dmg: 'Installer',
      dmgDesc: 'Drag to Applications',
      macosNote: '⚠️ App is unsigned. Right-click and select "Open" on first launch. See',
      macosNoteLink: 'FAQ',
      appimage: 'AppImage',
      appimageDesc: 'Make executable and run',
      intel: 'Intel',
      apple: 'Apple Silicon',
      allDownloads: 'View all downloads',
      recommendedFor: 'Recommended',
      mirrorSource: 'China Mirror',
      githubSource: 'GitHub Download',
      mobileTitle: 'Desktop App',
      mobileDesc:
        'MioSub is a desktop application. Please visit this page on a computer to download.',
      mobilePlatforms: 'Available for Windows, macOS, and Linux',
      webDemo: 'Try Online',
      webDemoDesc: 'Core features only. Download desktop app for full experience.',
    },
  }[locale];

  if (!mounted) {
    return (
      <div className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-500">{t.detecting}</p>
      </div>
    );
  }

  const renderDownloadOptions = () => {
    switch (platform) {
      case 'windows':
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🪟</span>
              <span className="font-medium">{t.windows}</span>
              <span className="text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950 px-2 py-0.5 rounded-full">
                {t.recommendedFor}
              </span>
              {hasMirror && (
                <span className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-full">
                  {t.mirrorSource}
                </span>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <a
                href={getDownloadUrl(FILE_NAMES.windows.portable, hasMirror)}
                className="block p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-purple-400 dark:hover:border-purple-500 transition-colors no-underline"
              >
                <div className="font-medium">{t.portable} (.zip)</div>
                <div className="text-sm text-gray-500">{t.portableDesc}</div>
              </a>
              <a
                href={getDownloadUrl(FILE_NAMES.windows.installer, hasMirror)}
                className="block p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-purple-400 dark:hover:border-purple-500 transition-colors no-underline"
              >
                <div className="font-medium">{t.installer} (.exe)</div>
                <div className="text-sm text-gray-500">{t.installerDesc}</div>
              </a>
            </div>
          </div>
        );

      case 'macos':
        const faqLink =
          locale === 'zh'
            ? '/docs/faq#macos-提示无法打开因为无法验证开发者'
            : '/en/docs/faq#macos-提示无法打开因为无法验证开发者';
        const macosOptions = [
          { key: 'arm64', file: FILE_NAMES.macos.arm64, label: t.apple },
          { key: 'x64', file: FILE_NAMES.macos.x64, label: t.intel },
        ];
        // 根据检测到的架构调整顺序
        if (arch === 'x64') {
          macosOptions.reverse();
        }
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🍎</span>
              <span className="font-medium">{t.macos}</span>
              <span className="text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950 px-2 py-0.5 rounded-full">
                {t.recommendedFor}
              </span>
              {hasMirror && (
                <span className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-full">
                  {t.mirrorSource}
                </span>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {macosOptions.map((opt, idx) => (
                <a
                  key={opt.key}
                  href={getDownloadUrl(opt.file, hasMirror)}
                  className="block p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-purple-400 dark:hover:border-purple-500 transition-colors no-underline"
                >
                  <div className="font-medium flex items-center gap-2">
                    {t.dmg} - {opt.label}
                    {idx === 0 && arch !== 'unknown' && (
                      <span className="text-xs text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950 px-1.5 py-0.5 rounded">
                        {t.recommendedFor}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500">{t.dmgDesc}</div>
                </a>
              ))}
            </div>
            <p className="text-sm text-amber-600 dark:text-amber-400">
              {t.macosNote}{' '}
              <a href={faqLink} className="underline">
                {t.macosNoteLink}
              </a>
            </p>
          </div>
        );

      case 'linux':
        const linuxOptions = [
          { key: 'x64', file: FILE_NAMES.linux.x64, label: 'x64' },
          { key: 'arm64', file: FILE_NAMES.linux.arm64, label: 'arm64' },
        ];
        // 根据检测到的架构调整顺序
        if (arch === 'arm64') {
          linuxOptions.reverse();
        }
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🐧</span>
              <span className="font-medium">{t.linux}</span>
              <span className="text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950 px-2 py-0.5 rounded-full">
                {t.recommendedFor}
              </span>
              {hasMirror && (
                <span className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-full">
                  {t.mirrorSource}
                </span>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {linuxOptions.map((opt, idx) => (
                <a
                  key={opt.key}
                  href={getDownloadUrl(opt.file, hasMirror)}
                  className="block p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-purple-400 dark:hover:border-purple-500 transition-colors no-underline"
                >
                  <div className="font-medium flex items-center gap-2">
                    {t.appimage} ({opt.label})
                    {idx === 0 && arch !== 'unknown' && (
                      <span className="text-xs text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950 px-1.5 py-0.5 rounded">
                        {t.recommendedFor}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500">{t.appimageDesc}</div>
                </a>
              ))}
            </div>
          </div>
        );

      case 'mobile':
        return (
          <div className="space-y-4 text-center py-2">
            <div className="flex items-center justify-center gap-2">
              <span className="text-lg">💻</span>
              <span className="font-medium">{t.mobileTitle}</span>
            </div>
            <p className="text-gray-600 dark:text-gray-400">{t.mobileDesc}</p>
            <p className="text-sm text-gray-500">{t.mobilePlatforms}</p>
            <a
              href="https://demo.miosub.app"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-gray-400 dark:hover:border-gray-500 text-gray-700 dark:text-gray-200 font-medium transition-colors no-underline"
            >
              <span>🌐</span>
              <span>{t.webDemo}</span>
            </a>
            <p className="text-xs text-gray-500">{t.webDemoDesc}</p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="my-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-900 shadow-md">
      {renderDownloadOptions()}

      <div className="mt-4 flex items-center gap-3">
        <a
          href={GITHUB_RELEASES_URL}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-purple-600 dark:hover:text-purple-400 transition-colors no-underline"
        >
          {hasMirror ? t.githubSource : t.allDownloads}
          <span>→</span>
        </a>
      </div>
    </div>
  );
}
