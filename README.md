# Gemini Subtitle Pro

**Gemini Subtitle Pro** 是一款基于 AI 的字幕创建、翻译和润色工具。它利用 Google 的 Gemini 模型进行高质量的翻译和校对，并使用 OpenAI 的 Whisper 进行精准的语音转写。

## ✨ 功能特性

### 核心 AI 功能
- **🤖 AI 转写**: 支持 **OpenAI Whisper API** (在线) 或 **Local Whisper** (离线，仅限桌面版) 转写视频/音频
- **🌍 智能翻译**: 使用 **Gemini 2.5 Flash** 将字幕翻译为简体中文
- **🧐 深度校对**: 使用 **Gemini 2.5 Flash** 或 **Gemini 3.0 Pro Preview** 润色和校正字幕，确保措辞自然准确
- **🎯 智能分割**: 使用 Silero VAD 进行智能音频分割，优化字幕时间轴

### 术语管理
- **📚 自定义术语表**: 维护项目特定的术语和翻译
- **🔄 AI 生成术语**: 从源内容自动生成术语建议
- **📤 导入/导出**: 轻松分享和备份您的术语表
- **🛡️ 强大的重试机制**: 内置术语提取重试逻辑，防止瞬时错误导致数据丢失

### 性能优化
- **⚡ VAD Worker**: 将音频处理移至后台线程，确保 UI 流畅
- **🚀 自定义 API 端点**: 支持配置自定义 OpenAI 和 Gemini API 端点 (Base URL)
- **⏱️ 请求超时配置**: 可自定义 API 请求超时时间，适应不同网络环境

### 批量操作
- **⏱️ 修复时间轴**: 使用 AI 自动对齐字幕时间轴与音频
- **✏️ 润色**: 结合上下文对选中片段进行批量润色

### 工作流功能
- **📸 版本控制**: 内置快照系统，可保存和恢复不同版本的工作
- **📂 双模式**: 支持从头开始 (新建项目) 或编辑现有文件 (导入模式)
- **💾 双语导出**: 下载 SRT 或 ASS 格式字幕 (双语或仅目标语言)
- **🐛 调试日志**: 具有可配置详细级别的综合日志系统，便于故障排查
### 💻 桌面版 vs 🌐 网页版

| 功能 | 桌面版 (Windows/Mac/Linux) | 网页版 (Web) |
| :--- | :--- | :--- |
| **本地 Whisper (离线)** | ✅ 支持 (免费，隐私保护) | ❌ 不支持 (需 API Key) |
| **文件读写** | ✅ 直接读写本地文件 | ⚠️ 受浏览器沙箱限制 |
| **性能** | ✅ 更佳 (原生进程) | ⚠️ 依赖浏览器 |
| **部署** | ✅ 一键安装包 | ⚠️ 需自行部署 (Vercel 等) |

## 🛠️ 技术栈

- **前端**: [React 19](https://react.dev/), [Vite](https://vitejs.dev/), [TypeScript](https://www.typescriptlang.org/)
- **样式**: Vanilla CSS 配合现代设计模式
- **AI 集成**:
    - [Google GenAI SDK](https://www.npmjs.com/package/@google/genai) (Gemini 2.5 Flash, Gemini 3.0 Pro Preview)
    - [OpenAI API](https://www.npmjs.com/package/openai) (Whisper-1)
- **音频处理**:
    - [@ricky0123/vad-web](https://www.npmjs.com/package/@ricky0123/vad-web) (Silero VAD 用于智能分割)
    - [onnxruntime-web](https://www.npmjs.com/package/onnxruntime-web) (ML 模型运行时)
- **图标**: [Lucide React](https://lucide.dev/)

## 📥 下载安装

我们提供了自动构建的安装包，您无需配置开发环境即可直接使用。

1.  访问项目的 [Releases](https://github.com/corvo007/gemini-subtitle-pro/releases) 页面。
2.  根据您的需求下载最新版本：
    *   **安装版**: `Gemini-Subtitle-Pro-Setup-x.x.x.exe` (推荐)
    *   **便携版**: `Gemini-Subtitle-Pro-x.x.x.exe` (单文件，即点即用)

## ⚙️ 配置说明

在应用设置中，您可以配置以下高级选项，分为三个主要部分：

### 1. 常规 (General)
- **API 配置**:
  - `Gemini API 密钥`: 必填。用于翻译 (Gemini 2.5 Flash) 和校对 (Gemini 3 Pro)。
  - `Gemini 端点`: 可选。自定义 Google Gemini API 的 Base URL。
  - `OpenAI API 密钥`: 必填（使用本地 Whisper 时不需要）。用于 Whisper 转写。
  - `OpenAI 端点`: 可选（使用本地 Whisper 时不需要）。自定义 OpenAI API 的 Base URL。
- **输出设置**:
  - `导出模式`: 选择 "双语 (原文 + 中文)" 或 "仅中文"。

### 2. 性能 (Performance)
- **批处理**:
  - `校对批次大小`: 单次 API 调用校对的行数。
  - `翻译批次大小`: 单次 API 调用翻译的行数。
- **并发控制**:
  - `并发数 (Flash)`: Gemini 2.5 Flash 的并发请求限制。
  - `并发数 (Pro)`: Gemini 3 Pro 的并发请求限制 (建议保持较低，如 < 5)。
- **其他**:
  - `分块时长`: 处理过程中分割音频文件的目标时长 (秒)。
  - `请求超时`: API 请求的超时时间 (默认 600 秒)。
  - `智能分段`: 启用/禁用使用 VAD 在自然停顿处分割音频。

### 3. 术语表 (Glossary)
- **自动提取**:
  - `启用自动术语表`: 是否在翻译前自动从音频中提取术语。
  - `术语提取音频长度`: 选择分析前 5/15/30 分钟或完整音频。
  - `自动确认术语表`: 如果发现术语，是否跳过确认对话框直接应用。
- **管理**: 支持手动添加、编辑、删除术语，以及导入/导出术语表。

## 🎙️ 本地 Whisper 配置 (仅限桌面版)

本项目支持集成 [whisper.cpp](https://github.com/ggerganov/whisper.cpp) 实现完全离线的语音转写。

*   **默认支持**: 我们的安装包 **已内置 CPU 版** 的 Whisper 核心组件 (`whisper-cli.exe`)。
*   **需手动下载**: 您需要**自行下载**模型文件 (`.bin`) 才能使用。
*   **GPU 加速**: 如需更快的速度，可手动替换为 GPU 版组件。

### ⚡ 快速开始 (Quick Start)

1.  **下载模型**:
    *   访问 [Hugging Face](https://huggingface.co/ggerganov/whisper.cpp/tree/main) 下载 GGML 格式的模型文件 (推荐 `ggml-base.bin` 或 `ggml-small.bin`)。
    *   您可以将模型文件保存在电脑的**任意位置**。
2.  **启用功能**:
    *   打开应用，进入 **设置** > **常规**，选择 **"使用本地 Whisper"**。
3.  **加载模型**:
    *   点击 **"选择模型文件"** 按钮。
    *   在弹出的文件浏览窗口中，找到并选中您下载的 `.bin` 模型文件。
4.  **开始使用**:
    *   模型路径设置完成后即可开始使用。

### 📦 模型下载指南 (Model Selection)

在 Hugging Face 的文件列表中，您会看到大量不同后缀的文件。请参考以下指南进行选择：

#### 1. 推荐下载 (最稳妥)
请下载 **标准版** 模型，文件名格式为 `ggml-[model].bin`。
*   **Base**: `ggml-base.bin` (平衡推荐)
*   **Small**: `ggml-small.bin` (精度更好)
*   **Medium**: `ggml-medium.bin` (高质量，需更多内存)

#### 2. 文件名后缀说明
*   **`.en` (如 `ggml-base.en.bin`)**: **仅英语**模型。如果您只转写英文视频，它比同级的多语言模型更准；但**不支持**中文或其他语言。
*   **`q5_0`, `q8_0` (如 `ggml-base-q5_0.bin`)**: **量化版**模型。体积更小、速度更快，但精度略有下降。
    *   `q8_0`: 几乎无损，推荐。
    *   `q5_0`: 损失少量精度，体积显著减小。
*   **`.mlmodelc.zip`**: ❌ **不要下载**。这是 macOS CoreML 专用格式，Windows 无法使用。

#### 3. 性能对比参考

| 模型 | 推荐文件名 | 大小 | 内存 | 速度 | 适用场景 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Tiny** | `ggml-tiny.bin` | 75 MB | ~390 MB | 极快 | 快速测试 |
| **Base** | `ggml-base.bin` | 142 MB | ~500 MB | 快 | 日常对话 (推荐) |
| **Small** | `ggml-small.bin` | 466 MB | ~1 GB | 中等 | 播客/视频 (推荐) |
| **Medium** | `ggml-medium.bin` | 1.5 GB | ~2.6 GB | 慢 | 复杂音频 |
| **Large-v3** | `ggml-large-v3.bin` | 2.9 GB | ~4.7 GB | 最慢 | 专业需求 |

### 🛠️ 进阶：GPU 加速 (NVIDIA 显卡)

如果您拥有 NVIDIA 显卡，强烈建议启用 GPU 加速以获得 5-10 倍的性能提升。

**前提条件**:
*   已安装最新版 **NVIDIA 显卡驱动**。
*   **必须安装** [CUDA Toolkit](https://developer.nvidia.com/cuda-downloads)。
    *   请注意：下载的 `whisper.cpp` 版本需与您的 CUDA 版本匹配 (例如：CUDA 12.x 需下载支持 CUDA 12 的版本)。

**安装步骤**:

1.  **下载组件**:
    *   访问 [whisper.cpp Releases](https://github.com/ggerganov/whisper.cpp/releases)。
    *   找到最新的 Windows GPU 版本，文件名通常为 `whisper-cublas-bin-x64.zip`。
2.  **解压文件**:
    *   解压下载的压缩包。您会看到 `main.exe` (或 `whisper-cli.exe`) 和多个 `.dll` 文件 (例如 `cublas64_12.dll`, `cudart64_12.dll` 等)。
3.  **替换文件**:
    *   打开应用的安装目录 (或者 `resources` 文件夹)。
    *   将解压出的**所有文件**复制进去。
    *   **重命名**: 将 `main.exe` (如果叫这个名字) 重命名为 `whisper-cli.exe`，并覆盖原有的 CPU 版本文件。
4.  **验证**:
    *   重启应用。尝试转写，如果速度显著提升，即表示 GPU 加速生效。

> **⚠️ 关键点**: 必须确保 `.dll` 动态库文件与 `whisper-cli.exe` 在同一个文件夹内。
>
> **📂 便携版 (Portable) 用户**:
> 请在 `.exe` 同级目录下创建一个名为 `resources` 的文件夹,并将所有文件放入其中;或者直接将文件放在 `.exe` 同级目录。

### ❓ 常见问题

*   **找不到选项?**: 请确认您使用的是**桌面版**,网页版不支持此功能。
*   **状态错误?**: 检查是否已正确选择了 `.bin` 模型文件。
*   **速度慢?**: CPU 模式下速度取决于处理器性能,建议使用 `Base` 或 `Small` 模型。如需极致速度请配置 GPU 加速。
*   **报错?**: 如果遇到错误,应用内会显示具体的错误信息和排查建议,请根据提示操作。


## 🚀 本地开发运行

**前提条件:** Node.js 18+

1. **安装依赖:**
   ```bash
   npm install
   # 或
   yarn install
   ```

2. **配置环境:**
   在根目录创建一个 `.env.local` 文件并添加您的 API 密钥：
   ```bash
   cp .env.example .env.local
   ```
   编辑 `.env.local`:
   ```env
   # 翻译和校对需要
   GEMINI_API_KEY=your_gemini_key

   # 转写 (Whisper) 需要
   OPENAI_API_KEY=your_openai_key
   ```

3. **运行应用:**
   ```bash
   npm run dev
   # 或
   yarn dev
   ```

4. **构建桌面应用 (Electron):**
   ```bash
   # 开发模式
   npm run electron:dev

   # 打包 (生成安装包和便携版)
   npm run electron:build
   ```
   打包完成后，您可以在 `release` 目录下找到安装程序 (`Setup.exe`) 和单文件便携版 (`.exe`)。

## ☁️ 部署

您可以将此应用程序部署到各种 Serverless 平台。

### Vercel

最简单的部署方式是使用 Vercel。

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fcorvo007%2Fgemini-subtitle-pro&env=GEMINI_API_KEY,OPENAI_API_KEY)

1. 点击上方按钮。
2. 连接您的 GitHub 仓库。
3. Vercel 将自动检测 Vite 配置。
4. **重要:** 在 Environment Variables 部分添加 `GEMINI_API_KEY` 和 `OPENAI_API_KEY`。

### Google Cloud Run

作为容器化应用程序部署在 Google Cloud Run 上。

[![Run on Google Cloud](https://deploy.cloud.run/button.svg)](https://deploy.cloud.run)

1. 点击上方按钮。
2. 选择您的项目和仓库。
3. 将自动检测 `Dockerfile`。
4. 在 **Variables & Secrets** 步骤中，添加您的 `GEMINI_API_KEY` 和 `OPENAI_API_KEY`。

### Cloudflare Pages

1. 将代码推送到 GitHub 仓库。
2. 登录 Cloudflare Dashboard 并转到 **Pages**。
3. 选择 **Connect to Git** 并选择您的仓库。
4. **构建设置:**
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Build Output Directory:** `dist`
5. **环境变量:**
   - 添加 `GEMINI_API_KEY` 和 `OPENAI_API_KEY`。

### Netlify

使用配置好的 `netlify.toml` 部署到 Netlify。

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/corvo007/gemini-subtitle-pro)

1. 点击上方按钮。
2. 连接您的 GitHub 仓库。
3. Netlify 将检测 `netlify.toml` 设置。
4. 转到 **Site settings > Build & deploy > Environment** 并添加您的 API 密钥。

### Render

在 Render 上作为静态站点部署。

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/corvo007/gemini-subtitle-pro)

1. 点击上方按钮。
2. Render 将读取 `render.yaml` 文件。
3. 设置过程中系统会提示您输入 `GEMINI_API_KEY` 和 `OPENAI_API_KEY`。
