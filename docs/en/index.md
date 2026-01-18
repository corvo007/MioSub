---
layout: home

hero:
  name: MioSub
  text: Pro-Level Subtitles, Zero Human Proofreading
  tagline: Auto Glossary · Speaker Recognition · Millisecond Alignment · One-Click Done
  image:
    src: /icon.png
    alt: MioSub
  actions:
    - theme: brand
      text: Get Started
      link: /en/guide/
    - theme: alt
      text: Try Online
      link: https://aisub-demo.netlify.app/
    - theme: alt
      text: GitHub
      link: https://github.com/corvo007/Gemini-Subtitle-Pro

features:
  - icon: ⚡
    title: High Efficiency
    details: 30-min video → 8-min output, intelligent parallel processing, no more waiting
  - icon: 🎯
    title: Precision Recognition
    details: Glossary extraction · Millisecond alignment · Speaker recognition, triple guarantee
  - icon: 🌍
    title: Multilingual Support
    details: CN/EN/JP UI, auto-detect source language, translate to any target language
  - icon: 🚀
    title: Full Automation
    details: Paste link → Get finished product, download-transcribe-translate-encode in one go
  - icon: 🖥️
    title: Professional Editor
    details: WYSIWYG, floating player, search & filter, batch operations, efficient editing
  - icon: 📦
    title: Flexible Import/Export
    details: SRT/ASS import editing, bilingual subtitle export, one-click video encoding
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

/* Browser window mockup */
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

/* Video demo cards */
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
  <h2 class="demo-title">Showcase</h2>
  <p class="demo-subtitle">Professional interface for efficient editing</p>
  
  <div class="demo-cards">
    <a href="https://www.bilibili.com/video/BV1XBrsBZE92/" target="_blank" class="demo-card">
      <span class="demo-card-icon">🎙️</span>
      <span class="demo-card-title">Voice Actor Radio Demo</span>
      <span class="demo-card-desc">30-minute variety show demonstrating multi-speaker recognition and labeling</span>
      <span class="demo-card-badge">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        Watch Video
      </span>
    </a>
    <a href="https://www.bilibili.com/video/BV1k1mgBJEEY/" target="_blank" class="demo-card">
      <span class="demo-card-icon">🚃</span>
      <span class="demo-card-title">Train Vlog Demo</span>
      <span class="demo-card-desc">29-minute travel video showcasing professional terminology auto-extraction</span>
      <span class="demo-card-badge">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        Watch Video
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
      <img src="/editor-en.png" alt="MioSub Interface" />
    </div>
  </div>
</div>
