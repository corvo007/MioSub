---
layout: home

hero:
  name: MioSub
  text: 专业级字幕，零人工校对
  tagline: 术语自动提取 · 说话人识别 · 毫秒对齐 · 一键完成
  image:
    src: /icon.png
    alt: MioSub
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/
    - theme: alt
      text: 在线体验
      link: https://aisub-demo.netlify.app/
    - theme: alt
      text: GitHub
      link: https://github.com/corvo007/Gemini-Subtitle-Pro

features:
  - icon: ⚡
    title: 高效处理
    details: 30 分钟视频 → 8 分钟出片，智能并发处理，告别漫长等待
  - icon: 🎯
    title: 精准识别
    details: 术语提取 · 毫秒对齐 · 说话人识别，三重保障确保字幕质量
  - icon: 🌍
    title: 多语言支持
    details: 中/英/日 UI，自动检测源语言，翻译到任意目标语言
  - icon: 🚀
    title: 全自动流程
    details: 粘贴链接 → 自动出成品，下载、转写、翻译、压制一气呵成
  - icon: 🖥️
    title: 专业编辑器
    details: 所见即所得、悬浮播放、搜索筛选、批量操作，高效编辑体验
  - icon: 📦
    title: 灵活导入导出
    details: SRT/ASS 导入编辑，双语字幕导出，视频压制一键完成
---

<style>
:root {
  --demo-gradient-start: #667eea;
  --demo-gradient-end: #764ba2;
}

.dark {
  --demo-gradient-start: #1e3a5f;
  --demo-gradient-end: #2d1b4e;
}

.demo-section {
  max-width: 1200px;
  margin: 4rem auto;
  padding: 0 24px;
}

.demo-title {
  text-align: center;
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  background: linear-gradient(120deg, var(--vp-c-brand-1), var(--vp-c-brand-2));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.demo-subtitle {
  text-align: center;
  color: var(--vp-c-text-2);
  margin-bottom: 2.5rem;
  font-size: 1.1rem;
}

/* 浏览器窗口模拟框 */
.browser-window {
  background: var(--vp-c-bg);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 
    0 8px 32px rgba(0, 0, 0, 0.15),
    0 0 0 1px rgba(0, 0, 0, 0.1);
  margin-top: 2.5rem; /* Moved margin here */
}

.browser-header {
  background: var(--vp-c-bg-soft);
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--vp-c-divider);
}

.browser-dots {
  display: flex;
  gap: 6px;
}

.browser-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.browser-dot.red { background: #ff5f56; }
.browser-dot.yellow { background: #ffbd2e; }
.browser-dot.green { background: #27c93f; }

.browser-title {
  flex: 1;
  text-align: center;
  font-size: 13px;
  color: var(--vp-c-text-2);
  font-weight: 500;
}

.browser-content img {
  width: 100%;
  display: block;
}

/* 视频卡片 */
.demo-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.demo-card {
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 1.5rem;
  text-decoration: none !important;
  color: inherit;
  transition: all 0.25s ease;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.demo-card * {
  text-decoration: none !important;
}

.demo-card:hover {
  border-color: var(--vp-c-brand-1);
  transform: translateY(-4px);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.1);
}

.demo-card-icon {
  font-size: 2rem;
}

.demo-card-title {
  font-weight: 600;
  font-size: 1.1rem;
  color: var(--vp-c-text-1);
}

.demo-card-desc {
  font-size: 0.9rem;
  color: var(--vp-c-text-2);
  line-height: 1.5;
}

.demo-card-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  color: var(--vp-c-brand-1);
  margin-top: auto;
  padding-top: 0.5rem;
}

.demo-card-badge svg {
  width: 14px;
  height: 14px;
}
</style>

<div class="demo-section">
  <h2 class="demo-title">效果展示</h2>
  <p class="demo-subtitle">专业级界面，高效编辑体验</p>
  
  <div class="demo-cards">
    <a href="https://www.bilibili.com/video/BV1XBrsBZE92/" target="_blank" class="demo-card">
      <span class="demo-card-icon">🎙️</span>
      <span class="demo-card-title">声优电台 Demo</span>
      <span class="demo-card-desc">30分钟综艺节目，展示多说话人识别与标注功能</span>
      <span class="demo-card-badge">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        观看视频
      </span>
    </a>
    <a href="https://www.bilibili.com/video/BV1k1mgBJEEY/" target="_blank" class="demo-card">
      <span class="demo-card-icon">🚃</span>
      <span class="demo-card-title">铁道 Vlog Demo</span>
      <span class="demo-card-desc">29分钟旅行视频，展示专业术语自动提取能力</span>
      <span class="demo-card-badge">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        观看视频
      </span>
    </a>
  </div>

  <div class="browser-window">
    <div class="browser-header">
      <div class="browser-dots">
        <span class="browser-dot red"></span>
        <span class="browser-dot yellow"></span>
        <span class="browser-dot green"></span>
      </div>
      <span class="browser-title">MioSub</span>
      <div style="width: 48px;"></div>
    </div>
    <div class="browser-content">
      <img src="/editor.png" alt="MioSub 界面截图" />
    </div>
  </div>
</div>
