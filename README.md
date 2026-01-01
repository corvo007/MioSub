# Gemini Subtitle Pro

[中文文档 (Chinese Documentation)](./README_zh.md)

**Gemini Subtitle Pro** is an AI-powered subtitle creation, translation, and polishing tool. It leverages Google's Gemini models for high-quality translation and polishing, and uses OpenAI's Whisper for precise speech transcription.

## 🔥 Core Features

**Design Goal**: Minimize manual intervention while increasing generated subtitle quality and efficiency.

Open-source subtitle tools on the market each have their focuses, but often have shortcomings in certain areas: timeline alignment requires manual adjustment, or proper noun translation is inaccurate without a glossary.

| Feature                              | Description                                                                                        |
| :----------------------------------- | :------------------------------------------------------------------------------------------------- |
| 🎧 **Auto Glossary Extraction**      | Intelligently extracts proper nouns from audio, verifying standard translations with Google Search |
| ⚡ **Long Context Translation**      | Splits by semantics into 5-10 minute segments, retaining full context for translation              |
| 💎 **Post-Transcription Processing** | Smart sentence splitting, timeline correction, and term replacement in one go                      |
| 🗣️ **Speaker Recognition**           | Automatically infers and labels multiple speakers' identities                                      |
| 🧠 **Smart Concurrency**             | Dynamically adjusts concurrency based on models; ~8-10 mins to process a 30 min video              |
| 🚀 **Full Auto Mode**                | Input a video link to automatically complete download, transcription, translation, and encoding    |
| 📺 **WYSIWYG Preview**               | Real-time subtitle rendering using `assjs` for accurate style representation (font, color, etc.)   |
| 🎬 **Video Download**                | Supports YouTube / Bilibili video download (Desktop version)                                       |
| ✂️ **Video Encoding**                | Built-in FFmpeg, supporting H.264/H.265 encoding and subtitle burning (Desktop version)            |
| 📦 **Other Features**                | Bilingual SRT/ASS export, version snapshots, custom API endpoints, cache management                |

---

## 📥 Quick Start (Desktop Version)

We provide auto-built installation packages so you can use it directly without configuring a development environment.

1.  Visit the project's [Releases](https://github.com/corvo007/gemini-subtitle-pro/releases) page.
2.  Download the latest version:
    - **Portable**: `Gemini-Subtitle-Pro-x.x.x-win-x64.zip`
3.  Unzip to any location and double-click `Gemini Subtitle Pro.exe` to launch the program.
4.  Open settings, verify your Gemini and OpenAI API KEYs, and configure other options.

    **⚠️ Notes:**
    1.  If you need to use a local Whisper model, please refer to the next section for configuration.
    2.  You need to ensure your API KEY can access **Gemini 3 Flash**, **Gemini 3 Pro** and **Gemini 2.5 Flash** models. Using API proxy services/sites is recommended (Personal recommendation: [YunWu API](https://yunwu.ai/register?aff=wmHr)).
    3.  To ensure translation quality, custom models are currently not supported.

5.  Enjoy!

---

## 📖 Feature Details

### 🎧 Extract Terms from Audio

**Problem Solved**: Manually maintaining glossaries is a heavy workload and easy to miss terms.

**Technical Solution**:

- Directly analyzes audio content to extract proper nouns
- Uses Google Search API to verify standard term translations
- Automatically applies to the translation workflow
- Especially suitable for raw content with no subtitles

**Implementation Details**: Based on Gemini 3 Pro multimodal capabilities, combined with Search Grounding features.

---

### ⚡ Long Context Translation

**Problem Solved**: Line-by-line or small batch translation loses context information.

**Technical Solution**:

- Uses VAD (Voice Activity Detection) to split semantically into 5-10 minute segments
- Provides both audio and full text to the AI model simultaneously
- Processes multiple segments in parallel to improve efficiency

---

### � WYSIWYG Video Preview

**Problem Solved**: Standard video players cannot render complex subtitle styles (ASS), and constant rendering is slow.

**Technical Features**:

- **Real-time Rendering**: Built-in `assjs` engine for accurate rendering of fonts, colors, and positions.
- **Smart Caching**: Efficiently caches transcoded previews to ensure smooth seeking and playback.
- **Cache Management**: Dedicated UI to monitor and clean up preview caches, keeping your disk lean.
- **Source Toggle**: One-click toggle between source text and translation for quick proofreading.

---

### �💎 Post-Transcription Processing

**Problem Solved**: Whisper raw output has issues like overly long sentences and timeline drift.

**Processing Flow**:

1.  Corrects recognition errors based on the glossary
2.  Intelligently splits long sentences (≤22 characters per line)
3.  Secondary validation of timeline alignment
4.  Uses Gemini 3 Flash for translation and polishing

---

### 🗣️ Speaker Recognition

**Problem Solved**: Sometimes unable to distinguish who is speaking when listening to radio programs.

**Function Description**: Automatically infers speaker identity, name, etc., based on context, automatically labeling different speakers (Hina Yomiya, Rin Tateishi, Hina Aoki, Mika Kohinata, Coco Hayashi, ...).

**Applicable Scenarios**:

- Multi-person dialogue scenarios (interviews, radio)
- Multi-role content (anime, movies)

---

### 🧠 Smart Concurrency Control

**Problem Solved**: Few similar open-source tools support concurrent processing, leading to long wait times when processing long videos or audio.

**Technical Features**: Dynamically adjusts concurrency count based on different models

- Gemini 3 Flash: Concurrency 5 (Speed priority)
- Gemini 3 Pro: Concurrency 2 (Avoid limits)

**Effect**: A 30-minute video is processed in about 8-10 minutes.

---

### 🎬 Video Download Support (Desktop Only)

Supports downloading videos from YouTube and Bilibili, with built-in yt-dlp engine.

#### ✅ Supported Link Formats

| Platform     | Type           | Example                        |
| :----------- | :------------- | :----------------------------- |
| **YouTube**  | Standard Video | `youtube.com/watch?v=xxx`      |
|              | Short Link     | `youtu.be/xxx`                 |
|              | Shorts         | `youtube.com/shorts/xxx`       |
|              | Embedded       | `youtube.com/embed/xxx`        |
| **Bilibili** | BV/av ID       | `bilibili.com/video/BVxxx`     |
|              | Multi-P Video  | `bilibili.com/video/BVxxx?p=2` |
|              | B23 Short Link | `b23.tv/xxx`                   |

#### ❌ Not Currently Supported

| Platform | Type                     | Reason                        |
| :------- | :----------------------- | :---------------------------- |
| YouTube  | Playlists/Channels       | Please use single video links |
| Bilibili | Anime/Movies             | Copyright restrictions        |
|          | Paid Courses             | Requires purchase             |
|          | Live Streaming           | Real-time stream              |
|          | Premium/Charging Videos  | Requires login cookies        |
|          | Favorites/Personal Space | Please use single video links |

---

### 🚀 Full Auto End-to-End Mode (Full Auto)

**Problem Solved**: Not only wanting subtitles, but wanting to directly get a "cooked" video with subtitles, without manually operating complex download, transcription, and encoding steps.

**Function Description**:
Just input a video link (YouTube/Bilibili), and Gemini Subtitle Pro will automatically handle all subsequent steps:

1.  **Auto Download**: Calls yt-dlp to download the best quality video.
2.  **Audio Extraction**: Automatically extracts audio and performs VAD segmentation.
3.  **Smart Transcription**: Uses Whisper for speech transcription.
4.  **AI Translation/Polishing**: Gemini models perform context-aware translation and proofreading.
5.  **Auto Encoding**: Uses FFmpeg to burn generated bilingual subtitles into the video (supports GPU acceleration).
6.  **Final Output**: Directly generates an MP4 video file with hard subtitles.

---

### ✂️ Video Encoding Export (Desktop Only)

Built-in FFmpeg engine, supporting high-performance video encoding and subtitle burning. Includes **intelligent hardware acceleration detection**, automatically prioritizing GPU (NVENC/QSV/AMF) for encoding.

#### Functional Features

| Feature                | Description                                                        |
| :--------------------- | :----------------------------------------------------------------- |
| **Encoder**            | H.264 (AVC) / H.265 (HEVC)                                         |
| **Quality Control**    | CRF mode (0-51, smaller value means higher quality)                |
| **Resolution**         | Original / 1080P / 720P / 480P / Custom                            |
| **Subtitle Embedding** | Supports local ASS/SRT files or direct use of workspace subtitles  |
| **One-Click Encoding** | Directly jump to encoding page after subtitle generation completes |

#### Workflow

1.  Complete subtitle generation/editing in the Subtitle Workbench
2.  Click the **"Encode Video"** button in the sidebar
3.  Automatically imports video and subtitles, adjust parameters and start encoding
4.  One-click open output directory after encoding completes

---

## 🎙️ Local Whisper Configuration (Desktop Only)

This project supports integrating [whisper.cpp](https://github.com/ggerganov/whisper.cpp) to achieve completely offline speech transcription.

- **Default Support**: Our installation package **has built-in CPU version** Whisper core component (`whisper-cli.exe`).
- **Manual Download Required**: You need to **download** model files (`.bin`) **yourself** to use it.
- **GPU Acceleration**: If you need faster speed, you can manually replace it with GPU version components.

### ⚡ Quick Start

1.  **Download Model**:
    - Visit [Hugging Face](https://huggingface.co/ggerganov/whisper.cpp/tree/main) to download GGML format model files (refer to the model download guide below for model selection).
    - You can save the model file in **any location** on your computer.
2.  **Enable Function**:
    - Open the application, go to **Settings** > **General**, select **"Use Local Whisper"**.
3.  **Load Model**:
    - Click the **"Browse"** button.
    - Find and select the `.bin` model file you downloaded in the file browser window.
4.  **Start Using**:
    - You can start using it after the model path setting is completed.

### 📦 Model Download Guide

In the Hugging Face file list, you will see a large number of files with different suffixes. Please refer to the following guide for selection:

#### 1. Recommended Download (Safest)

Please download the **Standard Version** model, filename format is `ggml-[model].bin`.

- **Base**: `ggml-base.bin` (Balanced Recommendation)
- **Small**: `ggml-small.bin` (Better Accuracy)
- **Medium**: `ggml-medium.bin` (High Quality, Requires More Memory)

#### 2. Filename Suffix Explanation

- **`.en` (e.g. `ggml-base.en.bin`)**: **English Only** model. If you only transcribe English videos, it is more accurate than multilingual models of the same level; but **does not support** Chinese or other languages.
- **`q5_0`, `q8_0` (e.g. `ggml-base-q5_0.bin`)**: **Quantized Version** model. Smaller size, faster speed, but slightly reduced precision.
  - `q8_0`: Almost lossless, recommended.
  - `q5_0`: Small loss of precision, significantly reduced size.
- **`.mlmodelc.zip`**: ❌ **Do not download**. This is a macOS CoreML dedicated format, Windows cannot use it.

#### 3. Performance Comparison Reference

| Model        | Recommended Filename | Size   | Memory  | Speed     | Applicable Scenarios             |
| :----------- | :------------------- | :----- | :------ | :-------- | :------------------------------- |
| **Tiny**     | `ggml-tiny.bin`      | 75 MB  | ~390 MB | Very Fast | Quick Testing                    |
| **Base**     | `ggml-base.bin`      | 142 MB | ~500 MB | Fast      | Daily Conversation (Recommended) |
| **Small**    | `ggml-small.bin`     | 466 MB | ~1 GB   | Medium    | Podcast/Video (Recommended)      |
| **Medium**   | `ggml-medium.bin`    | 1.5 GB | ~2.6 GB | Slow      | Complex Audio                    |
| **Large-v3** | `ggml-large-v3.bin`  | 2.9 GB | ~4.7 GB | Slowest   | Professional Needs               |

### 🛠️ Advanced: GPU Acceleration (NVIDIA Graphics Card)

If you have an NVIDIA graphics card, it is strongly recommended to enable GPU acceleration to get 5-10 times performance improvement.

**Prerequisites**:

- Installed latest version **NVIDIA Graphics Driver**.

**Installation Steps**:

1.  **Download Components**:
    - Visit [whisper.cpp Releases](https://github.com/ggerganov/whisper.cpp/releases).
    - Find the latest Windows GPU version, filename is usually `whisper-cublas-bin-x64.zip`.
2.  **Unzip Files**:
    - Unzip the downloaded compressed package. You will see `whisper-cli.exe` and multiple `.dll` files (e.g. `cublas64_12.dll`, `cudart64_12.dll`, etc.).
3.  **Place Files**:
    - Please create a folder named `resources` in the same directory as the `.exe` file, and put all unzipped files into it; or directly put the files in the same directory as the `.exe`.
    - Note: Must ensure `whisper-cli.exe` exists, and `.dll` dynamic library files are in the same folder as `whisper-cli.exe`.
4.  **Verification**:
    - Restart the application. Attempt transcription, if speed improves significantly, it means GPU acceleration is effective.

### ❓ FAQ

- **Cannot find option?**: Please confirm you are using the **Desktop Version**, the web version does not support this feature.
- **Status Error?**: Check if `.bin` model file is selected correctly.
- **Slow Speed?**: Speed under CPU mode depends on processor performance, recommend using `Base` or `Small` models. For extreme speed please configure GPU acceleration.

---

## ☁️ Deploy Web Version

You can deploy this application to various Serverless platforms, but using local Whisper is not supported.

### Vercel

The simplest way to deploy is using Vercel.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fcorvo007%2Fgemini-subtitle-pro&env=GEMINI_API_KEY,OPENAI_API_KEY)

1.  Click the button above.
2.  Connect your GitHub repository.
3.  Vercel will automatically detect Vite configuration.
4.  **Important:** Add `GEMINI_API_KEY` and `OPENAI_API_KEY` in the Environment Variables section.

### Google Cloud Run

Deploy as a containerized application on Google Cloud Run.

[![Run on Google Cloud](https://deploy.cloud.run/button.svg)](https://deploy.cloud.run)

1.  Click the button above.
2.  Select your project and repository.
3.  `Dockerfile` will be automatically detected.
4.  In **Variables & Secrets** step, add your `GEMINI_API_KEY` and `OPENAI_API_KEY`.

### Cloudflare Pages

1.  Push code to GitHub repository.
2.  Log in to Cloudflare Dashboard and go to **Pages**.
3.  Select **Connect to Git** and choose your repository.
4.  **Build Settings:**
    - **Framework Preset:** Vite
    - **Build Command:** `npm run build`
    - **Build Output Directory:** `dist`
5.  **Environment Variables:**
    - Add `GEMINI_API_KEY` and `OPENAI_API_KEY`.

### Netlify

Deploy to Netlify using the configured `netlify.toml`.

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/corvo007/gemini-subtitle-pro)

1.  Click the button above.
2.  Connect your GitHub repository.
3.  Netlify will detect `netlify.toml` settings.
4.  Go to **Site settings > Build & deploy > Environment** and add your API keys.

### Render

Deploy as a static site on Render.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/corvo007/gemini-subtitle-pro)

1.  Click the button above.
2.  Render will read `render.yaml` file.
3.  The system will prompt you to enter `GEMINI_API_KEY` and `OPENAI_API_KEY` during setup.

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

- [Project Architecture Document](./docs/ARCHITECTURE.md)
