<div align="center">
  <img src="./resources/icon.png" alt="MioSub" width="120" height="120">
  <h1>MioSub</h1>
  <p><strong>✨ 专业级字幕，零人工校对</strong></p>
  <p>术语自动提取 · 说话人识别 · 毫秒对齐 · 一键完成</p>

  <!-- Badges -->
  <p>
    <a href="https://github.com/corvo007/Gemini-Subtitle-Pro/actions"><img src="https://img.shields.io/github/actions/workflow/status/corvo007/Gemini-Subtitle-Pro/release.yml?style=for-the-badge&logo=github&label=Build" alt="Build Status"></a>
    <a href="https://github.com/corvo007/Gemini-Subtitle-Pro/stargazers"><img src="https://img.shields.io/github/stars/corvo007/Gemini-Subtitle-Pro?style=for-the-badge&logo=github&color=yellow" alt="GitHub Stars"></a>
    <a href="https://github.com/corvo007/Gemini-Subtitle-Pro/releases"><img src="https://img.shields.io/github/v/release/corvo007/Gemini-Subtitle-Pro?style=for-the-badge&logo=github&color=blue" alt="GitHub Release"></a>
    <a href="https://github.com/corvo007/Gemini-Subtitle-Pro/releases"><img src="https://img.shields.io/github/downloads/corvo007/Gemini-Subtitle-Pro/total?style=for-the-badge&logo=github&color=orange" alt="Downloads"></a>
  </p>
  <p>
    <img src="https://img.shields.io/badge/Electron-Desktop-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron">
    <img src="https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
    <a href="https://github.com/corvo007/Gemini-Subtitle-Pro/blob/main/LICENSE"><img src="https://img.shields.io/github/license/corvo007/Gemini-Subtitle-Pro?style=flat-square&color=green" alt="License"></a>
  </p>

  <p>
    <a href="./docs/ARCHITECTURE_zh.md">📖 架构文档</a> •
    <a href="https://aisub-demo.netlify.app/">🚀 在线体验</a> •
    <a href="https://github.com/corvo007/Gemini-Subtitle-Pro/releases">📥 下载</a> •
    <a href="https://github.com/corvo007/Gemini-Subtitle-Pro/issues">🐛 反馈问题</a> •
    <a href="./docs/README_en.md">🌐 English</a>
  </p>
</div>

---

<!-- 目录 -->
<details>
<summary><strong>📑 目录</strong></summary>

- [✨ 核心特性](#-核心特性)
- [🎬 效果展示](#-效果展示)
- [📥 快速开始](#-快速开始)
- [🎙️ 本地 Whisper 配置](#-本地-whisper-配置)
- [🎯 时间轴强制对齐配置](#-时间轴强制对齐配置)
- [🎬 视频下载支持](#-视频下载支持)
- [🚀 本地开发](#-本地开发)
- [🤝 贡献](#-贡献)
- [📜 许可证](#-许可证)
- [🙏 致谢](#-致谢)
- [⭐ Star History](#-star-history)

</details>

---

## ✨ 核心特性

|      类别       | 亮点                                        |
| :-------------: | ------------------------------------------- |
|   ⚡ **高效**   | **30 分钟视频 → 8 分钟出片**，智能并发处理  |
|   🎯 **精准**   | 术语提取 · 毫秒对齐 · 说话人识别，三重保障  |
|  🌍 **多语言**  | 中/英/日 UI，自动检测源语言，翻译到任意语言 |
|  🚀 **全自动**  | 粘贴链接 → 自动出成品，全程无人值守         |
|  🖥️ **编辑器**  | 所见即所得、悬浮播放、搜索筛选、批量操作    |
| 📦 **导入导出** | SRT/ASS 导入编辑，双语字幕导出，视频压制    |

---

## 🧠 技术细节

深入了解各项核心技术的实现方式：

<details>
<summary><strong>🎧 术语自动提取</strong></summary>

- 从音频中智能提取专有名词（人名、地名、作品名等）
- 配合 Google Search 验证标准译法
- 生成术语表供后续翻译参考，确保译名一致

</details>

<details>
<summary><strong>⚡ 长上下文翻译</strong></summary>

- 按语义切分为 5-10 分钟片段
- 保留完整上下文进行翻译，避免断章取义
- 支持场景预设（动漫、电影、新闻、科技），自动优化翻译风格

</details>

<details>
<summary><strong>💎 转录后处理</strong></summary>

- 智能断句：根据语义和停顿自动分割字幕
- 时间轴校正：修复 Whisper 输出的时间偏差
- 术语替换：自动应用术语表，统一译名

</details>

<details>
<summary><strong>🎯 强制对齐</strong></summary>

- 基于 CTC 技术的高精度时间轴对齐
- 支持毫秒级字符对齐
- 需额外配置对齐模型（可选）

</details>

<details>
<summary><strong>🗣️ 说话人识别</strong></summary>

- 自动推测并标注多说话人身份
- 支持自定义说话人名称和颜色
- 支持合并相邻同说话人字幕

</details>

<details>
<summary><strong>✨ 润色与重新生成</strong></summary>

- **批量重新生成**：选中片段一键重跑完整流程（转录→润色→对齐→翻译）
- **润色翻译**：对选中片段进行翻译质量优化，保持上下文连贯
- 操作前自动保存版本快照，可随时回滚

</details>

<details>
<summary><strong>🚀 全自动模式</strong></summary>

只需粘贴视频链接（YouTube/Bilibili），自动完成全部流程：

1. **自动下载**：调用 yt-dlp 下载最佳画质视频
2. **音频提取**：自动提取音频并进行 VAD 分段
3. **智能转写**：使用 Whisper 进行语音转录
4. **AI 翻译润色**：Gemini 进行上下文感知的翻译和校对
5. **自动压制**：FFmpeg 将双语字幕烧录到视频（支持 GPU 加速）
6. **输出成品**：直接生成带硬字幕的 MP4 文件

</details>

<details>
<summary><strong>🧠 智能并发控制</strong></summary>

根据不同模型动态调整并发数，避免限流的同时最大化速度：

- Gemini Flash：并发 5（速度优先）
- Gemini Pro：并发 2（避免限流）

**效果**：30 分钟视频约 8-10 分钟处理完成

</details>

<details>
<summary><strong>📺 视频预览优化</strong></summary>

- **实时渲染**：内置 assjs 引擎，精确渲染字体、颜色、位置
- **智能缓存**：高效缓存转码预览，确保流畅播放
- **源文/译文切换**：一键切换原文和译文，快速校对
- **悬浮播放**：支持画中画模式，播放器可拖拽调整

</details>

---

## 🎬 效果展示

**翻译成片（一次生成，无人工核对、修改）：**

| 类型         | 链接                                                         | 说明                                      |
| ------------ | ------------------------------------------------------------ | ----------------------------------------- |
| 🎙️ 声优电台  | [BV1XBrsBZE92](https://www.bilibili.com/video/BV1XBrsBZE92/) | 日语，30分钟，含说话人标注 (v2.13.0)      |
| 🚃 铁道 vlog | [BV1k1mgBJEEY](https://www.bilibili.com/video/BV1k1mgBJEEY/) | 日语，29分钟，大量地名和铁路术语 (v2.8.3) |

**快速体验 Demo（网页版，仅核心功能）：**

- 🌐 [在线体验](https://aisub-demo.netlify.app/)

**界面预览（支持实时字幕预览、自动滚动、说话人显示）：**

<div align="center">
  <img src="./resources/editor.png" alt="MioSub 界面截图" width="800">
</div>

---

## 📥 快速开始

我们提供了自动构建的安装包，无需配置开发环境即可直接使用。

### 1️⃣ 下载安装

1. 访问 [Releases](https://github.com/corvo007/Gemini-Subtitle-Pro/releases) 页面
2. 下载程序: `Gemini-Subtitle-Pro-x.x.x-win-x64.zip`
3. 解压到任意位置，双击 `MioSub.exe` 启动

### 2️⃣ 配置 API Key

打开设置，填写 Gemini 及 OpenAI API Key。

> [!IMPORTANT]
> **注意事项：**
>
> 1. 如需使用本地 Whisper 模型，请参考 [本地 Whisper 配置](#%EF%B8%8F-本地-whisper-配置)
> 2. 需保证 API Key 能请求 **Gemini 3 Flash**、**Gemini 3 Pro** 及 **Gemini 2.5 Flash** 模型
> 3. 推荐使用中转站 API（如 [云雾 API](https://yunwu.ai/register?aff=wmHr)）
> 4. 为保证翻译质量，暂不支持自定义模型

### 3️⃣ 开始使用

Enjoy! 🎉

---

## 🎙️ 本地 Whisper 配置

本项目支持集成 [whisper.cpp](https://github.com/ggerganov/whisper.cpp) 实现完全离线的语音转写。

- **默认支持**: 安装包已内置 CPU 版 Whisper 核心组件 (`whisper-cli.exe`)
- **需手动下载**: 需自行下载模型文件 (`.bin`)
- **GPU 加速**: 可手动替换为 GPU 版组件获得更快速度

<details>
<summary><strong>⚡ 快速开始</strong></summary>

1. **下载模型**: 访问 [Hugging Face](https://huggingface.co/ggerganov/whisper.cpp/tree/main) 下载 GGML 格式模型
2. **启用功能**: 设置 > 服务 > 语音识别 选择「本地 Whisper」
3. **加载模型**: 点击「浏览」选择下载的 `.bin` 模型文件
4. **开始使用**: 模型路径设置完成后即可使用

</details>

<details>
<summary><strong>📦 模型下载指南</strong></summary>

#### 推荐下载

请下载 **标准版** 模型，文件名格式为 `ggml-[model].bin`：

| 模型         | 文件名              | 大小   | 内存    | 速度 | 适用场景     |
| :----------- | :------------------ | :----- | :------ | :--- | :----------- |
| **Tiny**     | `ggml-tiny.bin`     | 75 MB  | ~390 MB | 极快 | 快速测试     |
| **Base**     | `ggml-base.bin`     | 142 MB | ~500 MB | 快   | 日常对话 ⭐  |
| **Small**    | `ggml-small.bin`    | 466 MB | ~1 GB   | 中等 | 播客/视频 ⭐ |
| **Medium**   | `ggml-medium.bin`   | 1.5 GB | ~2.6 GB | 慢   | 复杂音频     |
| **Large-v3** | `ggml-large-v3.bin` | 2.9 GB | ~4.7 GB | 最慢 | 专业需求     |

#### 文件名后缀说明

- **`.en`**: 仅英语模型，不支持中文等其他语言
- **`q5_0`, `q8_0`**: 量化版，体积更小、速度更快，精度略有下降

</details>

<details>
<summary><strong>🛠️ GPU 加速 (NVIDIA 显卡)</strong></summary>

**前提条件**: 已安装最新版 NVIDIA 显卡驱动

1. 访问 [whisper.cpp Releases](https://github.com/ggerganov/whisper.cpp/releases) 下载 `whisper-cublas-bin-x64.zip`
2. 解压获取 `whisper-cli.exe` 和 `.dll` 文件
3. 将所有文件放入 `.exe` 同级目录的 `resources` 文件夹（如果没有这个文件夹，可以手动创建一个）
4. 重启应用，尝试转写验证加速效果

</details>

<details>
<summary><strong>❓ 常见问题</strong></summary>

- **找不到选项？** 请确认使用的是**桌面版**，网页版不支持此功能
- **状态错误？** 检查是否已正确选择 `.bin` 模型文件
- **速度慢？** CPU 模式下速度取决于处理器性能，建议使用 `Base` 或 `Small` 模型

</details>

---

## 🎯 时间轴强制对齐配置

使用强制对齐模型来获得更高精度的字符级时间戳，适合对时间轴精度有高要求的场景。

<details>
<summary><strong>📋 配置步骤</strong></summary>

1. **准备工具**: 在 Releases 页面下载 `aligner-windows-x64.zip`，解压得到 `align.exe`
2. **下载模型**: 访问 Hugging Face 下载 [mms-300m-1130-forced-aligner](https://huggingface.co/MahmoudAshraf/mms-300m-1130-forced-aligner)（Release 也有提供）
3. **配置应用**:
   - 设置 > 增强 > 时间轴对齐 > 对齐模式 选择「CTC」
   - 设置 > 增强 > 时间轴对齐 > 对齐器执行文件: 选择 `align.exe`
   - 设置 > 增强 > 时间轴对齐 > 模型目录: 选择模型文件夹
4. **开启功能**: 启用后即可使用

</details>

---

## 🎬 视频下载支持

支持从 YouTube 和 Bilibili 下载视频，内置 yt-dlp 引擎。

<details>
<summary><strong>✅ 支持的链接格式</strong></summary>

| 平台         | 类型     | 示例                           |
| ------------ | -------- | ------------------------------ |
| **YouTube**  | 标准视频 | `youtube.com/watch?v=xxx`      |
|              | 短链接   | `youtu.be/xxx`                 |
|              | Shorts   | `youtube.com/shorts/xxx`       |
|              | 嵌入式   | `youtube.com/embed/xxx`        |
| **Bilibili** | BV/av 号 | `bilibili.com/video/BVxxx`     |
|              | 分P视频  | `bilibili.com/video/BVxxx?p=2` |
|              | B23 短链 | `b23.tv/xxx`                   |

</details>

<details>
<summary><strong>❌ 暂不支持</strong></summary>

| 平台     | 类型            | 原因               |
| -------- | --------------- | ------------------ |
| YouTube  | 播放列表/频道   | 请使用单个视频链接 |
| Bilibili | 番剧/影视       | 版权限制           |
|          | 付费课程        | 需购买             |
|          | 直播            | 实时流             |
|          | 大会员/充电视频 | 需登录 cookies     |
|          | 收藏夹/个人空间 | 请使用单个视频链接 |

</details>

---

## 🚀 本地开发

**前提条件**: Node.js 18+

```bash
# 安装依赖
yarn install

# 运行应用
yarn electron:dev

# 构建应用
yarn electron:build
```

打包完成后，可在 `release` 目录下找到便携版压缩包 (`.zip`)。

---

## 🤝 贡献

欢迎贡献代码、报告问题或提出建议！

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

---

## 📜 许可证

本项目基于 [MIT License](LICENSE) 开源。

---

## 🙏 致谢

- [Google Gemini](https://deepmind.google/technologies/gemini/) - AI 翻译和润色
- [OpenAI Whisper](https://openai.com/research/whisper) - 语音识别
- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) - 本地 Whisper 推理
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - 视频下载
- [FFmpeg](https://ffmpeg.org/) - 视频处理
- [Electron](https://www.electronjs.org/) - 桌面应用框架

---

## ⭐ Star History

如果这个项目对你有帮助，请给它一个 ⭐️！

[![Star History Chart](https://api.star-history.com/svg?repos=corvo007/Gemini-Subtitle-Pro&type=Date)](https://star-history.com/#corvo007/Gemini-Subtitle-Pro&Date)

---

## 📚 更多资源

- [项目架构文档](./docs/ARCHITECTURE_zh.md)
- [English Documentation](./docs/README_en.md)
