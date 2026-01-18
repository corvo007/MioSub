# 项目架构

## 📖 项目概述

**MioSub** 是一款 AI 驱动的视频字幕生成、翻译与润色工具。采用 React + Vite + Electron 技术栈构建，支持 Web 端和桌面客户端双端部署。

- **技术栈**: React 19, Vite 6, Electron 39, TypeScript
- **AI 引擎**: Google Gemini (翻译/润色), OpenAI Whisper (语音识别)

**DeepWiki项目详细解析：**[https://deepwiki.com/corvo007/Gemini-Subtitle-Pro](https://deepwiki.com/corvo007/Gemini-Subtitle-Pro)

---

## 🏗️ 技术栈架构

### 技术栈分层图

```mermaid
flowchart TB
    subgraph PRESENTATION["📱 表现层 (Presentation Layer)"]
        direction TB
        REACT["React 19.2<br/>UI 框架"]
        TAILWIND["TailwindCSS 4.1<br/>样式系统"]
        LUCIDE["Lucide React<br/>图标库"]
        UI_LIB["统一 UI 组件库<br/>(Button, Modal, Input)"]
        ASSJS["assjs<br/>所见即所得字幕渲染"]
        VIDEO_PLAYER["VideoPlayerPreview<br/>渐进式视频播放"]
    end

    subgraph BUILD["🔧 构建工具链"]
        direction TB
        VITE["Vite 6.2<br/>开发服务器 & 打包"]
        TS["TypeScript 5.8<br/>类型系统"]
        POSTCSS["PostCSS<br/>CSS 后处理"]
    end

    subgraph RUNTIME["⚡ 运行时层"]
        direction TB

        subgraph WEB["Web 运行时"]
            WEB_AUDIO["Web Audio API<br/>音频解码"]
            WEB_WORKER["Web Workers<br/>后台处理"]
            ONNX["ONNX Runtime Web<br/>VAD 模型推理"]
        end

        subgraph ELECTRON_RT["Electron 运行时"]
            ELECTRON["Electron 39<br/>桌面容器"]
            NODE["Node.js<br/>本地 API"]
            IPC["IPC<br/>进程通信"]
            LOCAL_VIDEO["local-video:// 协议<br/>流式媒体访问"]
        end
    end

    subgraph AI["🤖 AI 服务层"]
        direction TB

        subgraph GOOGLE["Google AI"]
            GEMINI_SDK["@google/genai<br/>Gemini SDK"]
            FLASH["Gemini 2.5/3 Flash<br/>翻译/润色"]
            PRO["Gemini 3 Pro<br/>术语/说话人/润色"]
        end

        subgraph OPENAI_SVC["OpenAI"]
            OPENAI_SDK["openai 6.9<br/>OpenAI SDK"]
            WHISPER_API["Whisper API<br/>云端转写"]
        end

        subgraph LOCAL_AI["Local AI"]
            VAD["Silero VAD<br/>(ONNX)"]
            WHISPER_CPP["whisper.cpp<br/>本地转写"]
        end
    end

    subgraph NATIVE["🖥️ 原生层"]
        direction TB
        FFMPEG_BIN["FFmpeg<br/>音视频处理"]
        YT_DLP["yt-dlp<br/>视频下载"]
        CUDA["CUDA (可选)<br/>GPU 加速"]
    end

    PRESENTATION --> BUILD
    BUILD --> RUNTIME
    RUNTIME --> AI
    ELECTRON_RT --> NATIVE
```

### 依赖版本概览

| 类别           | 依赖包             | 版本   | 用途            |
| :------------- | :----------------- | :----- | :-------------- |
| **核心框架**   | React              | 19.2   | UI 框架         |
|                | Vite               | 6.2    | 构建工具        |
|                | TypeScript         | 5.8    | 类型系统        |
|                | Electron           | 39     | 桌面容器        |
| **AI SDK**     | @google/genai      | Latest | Gemini API      |
|                | openai             | Latest | Whisper API     |
|                | onnxruntime-web    | 1.23   | VAD 推理        |
| **音视频处理** | @ricky0123/vad-web | 0.0.30 | Silero VAD 封装 |
|                | fluent-ffmpeg      | 2.1    | FFmpeg 控制     |
| **国际化**     | i18next            | 25.7   | 国际化核心      |
|                | react-i18next      | 16.5   | React 绑定      |
| **渲染**       | assjs              | 0.1.4  | ASS 字幕渲染    |
| **样式**       | TailwindCSS        | 4.1    | 原子化 CSS      |
|                | Lucide React       | 0.554  | 图标库          |
| **工具库**     | clsx / tw-merge    | Latest | 样式合并        |

---

## 📏 代码规范与工程化

### 路径别名 (Path Aliases)

本项目在 `src` 和 `electron` 目录下全面使用路径别名。除同级文件引用外（推荐统一使用别名），**禁止使用相对路径**（如 `../../`）进行跨层级模块引用。

- `@/*` -> `src/*` (核心源代码)
- `@components/*` -> `src/components/*`
- `@hooks/*` -> `src/hooks/*`
- `@services/*` -> `src/services/*`
- `@utils/*` -> `src/utils/*`
- `@types/*` -> `src/types/*`
- `@lib/*` -> `src/lib/*` (新增)
- `@electron/*` -> `electron/*` (Electron 主进程代码)

### 目录组织原则

- **就近原则 (Co-location)**：仅在特定模块内部使用的工具函数或组件，应放置在该模块的 `utils` 或 `shared` 子目录下，而不是提升到全局。
  - 例如，`src/components/endToEnd/wizard/utils/validation.ts` 仅服务于向导模块。
- **关注点分离**：
  - `src/utils`: 全局通用的、纯 JavaScript/UI 辅助函数。
  - `src/services/utils`: 基础设施、日志、系统级工具。
