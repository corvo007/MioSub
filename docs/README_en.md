<div align="center">
  <img src="../resources/icon.png" alt="MioSub" width="120" height="120">
  <h1>MioSub</h1>
  <p><strong>✨ Studio-Quality Subtitles, Zero Manual Work</strong></p>
  <p>Glossary Extraction · Speaker Detection · Frame-Perfect · Hands-Free</p>

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
    <a href="./ARCHITECTURE.md">📖 Architecture</a> •
    <a href="https://aisub-demo.netlify.app/">🚀 Live Demo</a> •
    <a href="https://github.com/corvo007/Gemini-Subtitle-Pro/releases">📥 Download</a> •
    <a href="https://github.com/corvo007/Gemini-Subtitle-Pro/issues">🐛 Report Bug</a> •
    <a href="../README.md">🇨🇳 中文</a>
  </p>
</div>

---

## ✨ Core Features

|       Category       | Highlights                                                          |
| :------------------: | ------------------------------------------------------------------- |
|     ⚡ **Fast**      | **30 min video → 8 min processing**, smart concurrent processing    |
|   🎯 **Accurate**    | Glossary extraction · Millisecond alignment · Speaker recognition   |
| 🌍 **Multilingual**  | EN/CN/JP UI, auto-detect source language, translate to any language |
|   🚀 **Full Auto**   | Paste link → Auto output, completely hands-free                     |
|    🖥️ **Editor**     | WYSIWYG preview, floating player, search & filter, batch operations |
| 📦 **Import/Export** | SRT/ASS import & edit, bilingual export, video encoding             |

---

**Demo Videos (One-shot generation, no manual editing):**

<!-- TODO: Replace Bilibili links with YouTube links -->

| Type                 | Link                                                         | Details                                        |
| -------------------- | ------------------------------------------------------------ | ---------------------------------------------- |
| 🎙️ Voice Actor Radio | [BV1XBrsBZE92](https://www.bilibili.com/video/BV1XBrsBZE92/) | Japanese, 30 min, speaker labels (v2.13.0)     |
| 🚃 Railway Vlog      | [BV1k1mgBJEEY](https://www.bilibili.com/video/BV1k1mgBJEEY/) | Japanese, 29 min, railway terminology (v2.8.3) |

**Live Demo (Web version, core features only):**

- 🌐 [Try Online](https://aisub-demo.netlify.app/)

**Interface Preview:**

<div align="center">
  <img src="../resources/editor_en.png" alt="MioSub Interface" width="800">
</div>

---

## 📥 Quick Start (Desktop Version)

We provide auto-built installation packages so you can use it directly without configuring a development environment.

1.  Visit the project's [Releases](https://github.com/corvo007/gemini-subtitle-pro/releases) page.
2.  Download the latest version: `Gemini-Subtitle-Pro-x.x.x-win-x64.zip`
3.  Unzip to any location and double-click `MioSub.exe` to launch the program.
4.  Open settings, verify your Gemini and OpenAI API KEYs, and configure other options.

    **⚠️ Notes:**
    1.  If you need to use a local Whisper model, please refer to the next section for configuration.
    2.  You need to ensure your API KEY can access **Gemini 3 Flash**, **Gemini 3 Pro** and **Gemini 2.5 Flash** models. Using API proxy services/sites is recommended.
    3.  To ensure translation quality, custom models are currently not supported.

5.  Enjoy!

---

## 🧠 Technical Details

Dive deeper into how each core technology works:

<details>
<summary><strong>🎧 Auto Glossary Extraction</strong></summary>

- Intelligently extracts proper nouns from audio (names, places, titles, etc.)
- Verifies standard translations via Google Search
- Generates glossary for consistent translation throughout

</details>

<details>
<summary><strong>⚡ Long Context Translation</strong></summary>

- Splits by semantics into 5-10 minute segments
- Retains full context for accurate translation
- Supports scene presets (anime, movie, news, tech) for style optimization

</details>

<details>
<summary><strong>💎 Post-Transcription Processing</strong></summary>

- **Smart Splitting**: Automatically segments subtitles by semantics and pauses
- **Timeline Correction**: Fixes Whisper output time drift
- **Term Replacement**: Applies glossary for consistent terminology

</details>

<details>
<summary><strong>🎯 Forced Alignment</strong></summary>

- CTC-based high-precision timeline alignment
- Millisecond-level character alignment
- Optional, requires additional alignment model configuration

</details>

<details>
<summary><strong>🗣️ Speaker Recognition</strong></summary>

- Automatically infers and labels multiple speakers
- Custom speaker names and colors
- Merge adjacent same-speaker subtitles

</details>

<details>
<summary><strong>✨ Refinement & Regeneration</strong></summary>

- **Batch Regenerate**: One-click full pipeline re-run (transcription → refinement → alignment → translation)
- **Proofread Translation**: Optimize translation quality while maintaining context
- Auto-saves version snapshot before operations, rollback anytime

</details>

<details>
<summary><strong>🚀 Full Auto Mode</strong></summary>

Just paste a video link (YouTube/Bilibili), the entire process runs automatically:

1. **Auto Download**: yt-dlp fetches best quality video
2. **Audio Extraction**: Extract audio and VAD segmentation
3. **Smart Transcription**: Whisper speech-to-text
4. **AI Translation**: Gemini context-aware translation and proofreading
5. **Auto Encoding**: FFmpeg burns bilingual subtitles (GPU accelerated)
6. **Final Output**: Ready-to-share MP4 with hardcoded subtitles

</details>

<details>
<summary><strong>🧠 Smart Concurrency</strong></summary>

Dynamically adjusts concurrency based on model to maximize speed while avoiding rate limits:

- Gemini Flash: Concurrency 5 (Speed priority)
- Gemini Pro: Concurrency 2 (Avoid limits)

**Result**: 30 min video processed in ~8-10 minutes

</details>

<details>
<summary><strong>📺 Video Preview</strong></summary>

- **Real-time Rendering**: Built-in assjs engine for accurate font, color, position rendering
- **Smart Caching**: Efficient transcode preview caching for smooth playback
- **Source/Translation Toggle**: One-click switch for quick proofreading
- **Floating Player**: Picture-in-picture mode, draggable and resizable

</details>

---

## 🎙️ Local Whisper Configuration

This project supports integrating [whisper.cpp](https://github.com/ggerganov/whisper.cpp) for completely offline speech transcription.

- **Built-in**: Installation package includes CPU version Whisper (`whisper-cli.exe`)
- **Model Required**: Download model files (`.bin`) separately
- **GPU Acceleration**: Manually replace with GPU version for faster speed

<details>
<summary><strong>⚡ Quick Start</strong></summary>

1. **Download Model**: Visit [Hugging Face](https://huggingface.co/ggerganov/whisper.cpp/tree/main) to download GGML format model
2. **Enable Feature**: Settings > Services > Speech Recognition, select "Local Whisper"
3. **Load Model**: Click "Browse" and select the downloaded `.bin` model file
4. **Start Using**: Ready after model path is configured

</details>

<details>
<summary><strong>📦 Model Download Guide</strong></summary>

#### Recommended Models

Download **Standard Version** models, filename format: `ggml-[model].bin`

| Model        | Filename            | Size   | Memory  | Speed     | Use Case         |
| :----------- | :------------------ | :----- | :------ | :-------- | :--------------- |
| **Tiny**     | `ggml-tiny.bin`     | 75 MB  | ~390 MB | Very Fast | Quick Testing    |
| **Base**     | `ggml-base.bin`     | 142 MB | ~500 MB | Fast      | Daily Use ⭐     |
| **Small**    | `ggml-small.bin`    | 466 MB | ~1 GB   | Medium    | Podcast/Video ⭐ |
| **Medium**   | `ggml-medium.bin`   | 1.5 GB | ~2.6 GB | Slow      | Complex Audio    |
| **Large-v3** | `ggml-large-v3.bin` | 2.9 GB | ~4.7 GB | Slowest   | Professional     |

#### Filename Suffix Guide

- **`.en`**: English-only model, doesn't support other languages
- **`q5_0`, `q8_0`**: Quantized versions, smaller size, slightly reduced precision

</details>

<details>
<summary><strong>🛠️ GPU Acceleration (NVIDIA)</strong></summary>

For 5-10x performance improvement with NVIDIA GPUs:

1. **Download**: Get GPU version from [whisper.cpp Releases](https://github.com/ggerganov/whisper.cpp/releases) (`whisper-cublas-bin-x64.zip`)
2. **Extract**: Unzip to get `whisper-cli.exe` and `.dll` files
3. **Place Files**: Put all files in the app's `resources` folder or same directory as the app
4. **Verify**: Restart app and test - significant speed improvement indicates success

</details>

---

## 🎯 Forced Alignment Configuration

Use forced alignment for higher precision character-level timestamps.

<details>
<summary><strong>📋 Setup Steps</strong></summary>

1. **Prepare Tools**: Download `aligner-windows-x64.zip` from Releases, extract to get `align.exe`
2. **Download Model**: Get [mms-300m-1130-forced-aligner](https://huggingface.co/MahmoudAshraf/mms-300m-1130-forced-aligner) from Hugging Face (also available in Releases)
3. **Configure**:
   - Settings > Enhancement > Timestamp Alignment > Alignment Mode: Select "CTC"
   - Settings > Enhancement > Timestamp Alignment > Aligner Executable: Select `align.exe`
   - Settings > Enhancement > Timestamp Alignment > Model Directory: Select model folder
4. **Enable**: Toggle on to start using

</details>

---

## ☁️ Deploy Web Version

You can deploy this application to various Serverless platforms (local Whisper not supported).

> **Note:** Config files (`netlify.toml`, `vercel.json`, `wrangler.toml`) are in the `deploy/` directory.

<details>
<summary><strong>Vercel (Recommended)</strong></summary>

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fcorvo007%2Fgemini-subtitle-pro&env=GEMINI_API_KEY,OPENAI_API_KEY)

1. Click the button above
2. Connect your GitHub repository
3. Add `GEMINI_API_KEY` and `OPENAI_API_KEY` in Environment Variables

</details>

<details>
<summary><strong>Google Cloud Run</strong></summary>

[![Run on Google Cloud](https://deploy.cloud.run/button.svg)](https://deploy.cloud.run)

1. Click the button above
2. Select your project and repository
3. Specify Dockerfile path: `deploy/Dockerfile`
4. Add your API keys in Variables & Secrets

</details>

<details>
<summary><strong>Netlify</strong></summary>

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/corvo007/gemini-subtitle-pro)

1. Click the button above
2. Connect your GitHub repository
3. Add API keys in Site settings > Build & deploy > Environment

</details>

<details>
<summary><strong>Cloudflare Pages</strong></summary>

1. Push code to GitHub
2. Go to Cloudflare Dashboard > Pages > Connect to Git
3. Build Settings: Framework `Vite`, Command `npm run build`, Output `dist`
4. Add `GEMINI_API_KEY` and `OPENAI_API_KEY` in Environment Variables

</details>

---

## 🚀 Local Development Run

**Prerequisites:** Node.js 18+

1.  **Install Dependencies:**

    ```bash
    npm install
    # or
    yarn install
    ```

2.  **Configure Environment:**
    Create a `.env.local` file in the root directory and add your API keys:

    ```bash
    cp .env.example .env.local
    ```

    Edit `.env.local`:

    ```env
    # Required for translation and proofreading
    GEMINI_API_KEY=your_gemini_key

    # Required for transcription (Whisper)
    OPENAI_API_KEY=your_openai_key
    ```

3.  **Run Application:**

    ```bash
    npm run dev
    # or
    yarn dev
    ```

4.  **Build Desktop Application (Electron):**

    ```bash
    # Development Mode
    npm run electron:dev

    # Package (Generate zip archive)
    npm run electron:build
    ```

    After packaging completes, you can find the portable version archive (`.zip`) in the `release` directory. Unzip and run.

---

## 📚 Documentation

- [Project Architecture Document](./ARCHITECTURE.md)
