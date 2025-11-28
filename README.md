<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Gemini Subtitle Pro

**Gemini Subtitle Pro** is an AI-powered tool for creating, translating, and polishing subtitles. It leverages Google's Gemini models for high-quality translation and proofreading, and OpenAI's Whisper for accurate transcription.

## ✨ Features

### Core AI Features
- **🤖 AI Transcription**: Transcribe video/audio using OpenAI Whisper (via API)
- **🌍 Smart Translation**: Translate subtitles to Simplified Chinese using Gemini 2.5 Flash
- **🧐 Deep Proofreading**: Polish and correct subtitles with Gemini 2.0 Flash or Gemini 2.0 Pro, ensuring natural and accurate phrasing
- **🎯 Smart Segmentation**: Intelligent audio segmentation using Silero VAD for optimal subtitle timing

### Quality Control Pipeline ⚠️ WIP
> [!NOTE]
> This feature is currently under development and not yet fully functional.

- **🔍 Automated QC**: Three-stage Review→Fix→Validate pipeline with configurable iterations
- **📊 Quality Metrics**: Acceptance criteria based on issue severity and rate per minute
- **🎭 Genre-Aware**: Tailored prompts for different content genres (documentary, drama, technical, etc.)
- **🔄 Iterative Refinement**: Automatic iteration until quality standards are met

### Terminology Management
- **📚 Custom Glossary**: Maintain project-specific terminology and translations
- **✅ Consistency Checking**: Automatic detection of terminology inconsistencies
- **🔄 AI-Generated Terms**: Generate glossary suggestions from source content

### Batch Operations
- **⏱️ Fix Timestamps**: Automatically align subtitle timestamps with audio using AI
- **🔄 Re-translate**: Select specific segments to re-translate
- **✏️ Proofread**: Batch polish selected segments with context awareness

### Workflow Features
- **📸 Version Control**: Built-in snapshot system to save and restore different versions of your work
- **📂 Dual Modes**: Start from scratch (New Project) or edit existing files (Import Mode)
- **💾 Bilingual Export**: Download subtitles in SRT or ASS formats (Bilingual or Target Language)
- **🐛 Debug Logging**: Comprehensive logging system with configurable verbosity for troubleshooting

## 🛠️ Tech Stack

- **Frontend**: [React 19](https://react.dev/), [Vite](https://vitejs.dev/), [TypeScript](https://www.typescriptlang.org/)
- **Styling**: Vanilla CSS with modern design patterns
- **AI Integration**:
    - [Google GenAI SDK](https://www.npmjs.com/package/@google/genai) (Gemini 2.0 Flash, Gemini 2.0 Pro)
    - [OpenAI API](https://www.npmjs.com/package/openai) (Whisper-1, GPT-4o series for QC)
- **Audio Processing**:
    - [@ricky0123/vad-web](https://www.npmjs.com/package/@ricky0123/vad-web) (Silero VAD for smart segmentation)
    - [onnxruntime-web](https://www.npmjs.com/package/onnxruntime-web) (ML model runtime)
- **Icons**: [Lucide React](https://lucide.dev/)

## 🚀 Run Locally

**Prerequisites:** Node.js 18+

1. **Install dependencies:**
   ```bash
   npm install
   # or
   yarn install
   ```

2. **Configure Environment:**
   Create a `.env.local` file in the root directory and add your API keys:
   ```bash
   cp .env.example .env.local
   ```
   Edit `.env.local`:
   ```env
   # Required for Translation & Proofreading
   GEMINI_API_KEY=your_gemini_key

   # Required for Transcription (Whisper)
   OPENAI_API_KEY=your_openai_key
   ```

3. **Run the app:**
   ```bash
   npm run dev
   # or
   yarn dev
   ```

## ☁️ Deploy

You can deploy this application to various serverless platforms.

### Vercel

The easiest way to deploy is using Vercel.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fcorvo007%2Fgemini-subtitle-pro&env=GEMINI_API_KEY,OPENAI_API_KEY)

1. Click the button above.
2. Connect your GitHub repository.
3. Vercel will automatically detect the Vite configuration.
4. **Important:** Add `GEMINI_API_KEY` and `OPENAI_API_KEY` in the Environment Variables section.

### Google Cloud Run

Deploy as a containerized application on Google Cloud Run.

[![Run on Google Cloud](https://deploy.cloud.run/button.svg)](https://deploy.cloud.run)

1. Click the button above.
2. Select your project and repository.
3. The `Dockerfile` will be automatically detected.
4. In the **Variables & Secrets** step, add your `GEMINI_API_KEY` and `OPENAI_API_KEY`.

### Cloudflare Pages

1. Push your code to a GitHub repository.
2. Log in to the Cloudflare Dashboard and go to **Pages**.
3. Select **Connect to Git** and choose your repository.
4. **Build Settings:**
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Build Output Directory:** `dist`
5. **Environment Variables:**
   - Add `GEMINI_API_KEY` and `OPENAI_API_KEY`.

### Netlify

Deploy with Netlify using the configured `netlify.toml`.

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/corvo007/gemini-subtitle-pro)

1. Click the button above.
2. Connect your GitHub repository.
3. Netlify will detect the `netlify.toml` settings.
4. Go to **Site settings > Build & deploy > Environment** and add your API keys.

### Render

Deploy as a Static Site on Render.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/corvo007/gemini-subtitle-pro)

1. Click the button above.
2. Render will read the `render.yaml` file.
3. You will be prompted to enter your `GEMINI_API_KEY` and `OPENAI_API_KEY` during the setup.
