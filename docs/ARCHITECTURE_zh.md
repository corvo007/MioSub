# Gemini Subtitle Pro - 项目架构文档

[English Documentation](./ARCHITECTURE.md)

## 📖 项目概述

**Gemini Subtitle Pro** 是一款基于 AI 的字幕创建、翻译和润色工具。采用 React + Vite + Electron 技术栈，支持 Web 和桌面客户端双平台部署。

- **技术栈**: React 19, Vite 6, Electron 39, TypeScript
- **AI 引擎**: Google Gemini (翻译/润色), OpenAI Whisper (语音识别)

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
        UI_LIB["Unified UI Components<br/>(Button, Modal, Input)"]
        ASSJS["assjs<br/>所见即所得字幕渲染"]
    end

    subgraph BUILD["🔧 构建层 (Build Toolchain)"]
        direction TB
        VITE["Vite 6.2<br/>开发服务器 & 打包"]
        TS["TypeScript 5.8<br/>类型系统"]
        POSTCSS["PostCSS<br/>CSS 后处理"]
    end

    subgraph RUNTIME["⚡ 运行时层 (Runtime Layer)"]
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
        end
    end

    subgraph AI["🤖 AI 服务层 (AI Services)"]
        direction TB

        subgraph GOOGLE["Google AI"]
            GEMINI_SDK["@google/genai<br/>Gemini SDK"]
            FLASH["Gemini 2.5/3 Flash<br/>翻译/校对"]
            PRO["Gemini 3 Pro<br/>术语/说话人/校对"]
        end

        subgraph OPENAI_SVC["OpenAI"]
            OPENAI_SDK["openai 6.9<br/>OpenAI SDK"]
            WHISPER_API["Whisper API<br/>云端转写"]
        end

        subgraph LOCAL_AI["本地 AI"]
            VAD["Silero VAD<br/>(ONNX)"]
            WHISPER_CPP["whisper.cpp<br/>本地转写"]
        end
    end

    subgraph NATIVE["🖥️ 原生层 (Native Layer)"]
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

### 依赖版本一览

| 类别         | 依赖               | 版本   | 用途               |
| ------------ | ------------------ | ------ | ------------------ |
| **核心框架** | React              | 19.2   | UI 框架            |
|              | Vite               | 6.2    | 构建工具           |
|              | TypeScript         | 5.8    | 类型系统           |
|              | Electron           | 39     | 桌面容器           |
| **AI SDK**   | @google/genai      | Latest | Gemini API         |
|              | openai             | Latest | Whisper API        |
|              | onnxruntime-web    | 1.23   | VAD 推理           |
| **音频处理** | @ricky0123/vad-web | 0.0.30 | Silero VAD 封装    |
|              | fluent-ffmpeg      | 2.1    | FFmpeg 控制        |
| **国际化**   | i18next            | 25.7   | 国际化核心         |
|              | react-i18next      | 16.5   | React 绑定         |
| **字幕渲染** | assjs              | 0.1.4  | 所见即所得字幕渲染 |
| **样式**     | TailwindCSS        | 4.1    | 原子化 CSS         |
|              | Lucide React       | 0.554  | 图标库             |
| **工具**     | clsx / tw-merge    | Latest | 样式合并           |

---

## 📏 代码规范与工程化

### 路径别名 (Path Aliases)

本项目在 `src` 和 `electron` 目录下全面使用路径别名，**禁止使用相对路径** (如 `../../`) 引用跨层级模块，但同层级文件引用除外（推荐统一使用别名）。

- `@/*` -> `src/*` (核心源码)
- `@components/*` -> `src/components/*`
- `@hooks/*` -> `src/hooks/*`
- `@services/*` -> `src/services/*`
- `@utils/*` -> `src/utils/*`
- `@types/*` -> `src/types/*`
- `@lib/*` -> `src/lib/*` (新增)
- `@electron/*` -> `electron/*` (Electron 主进程代码)

### 目录组织原则

- **就近原则 (Co-location)**: 仅在特定模块内部使用的工具函数或组件，应放置在该模块的 `utils` 或 `shared` 子目录下，而非提升到全局。
  - 例如 `src/components/endToEnd/wizard/utils/validation.ts` 仅服务于向导模块。
- **关注点分离**:
  - `src/utils`: 全局通用、纯 JavaScript/UI 辅助函数。
  - `src/services/utils`: 基础设施、日志、系统级工具。

---

## 🧱 应用模块架构

```mermaid
flowchart TB
    subgraph APP_LAYER["应用层 (App Layer)"]
        direction LR
        APP["App.tsx<br/>路由 & 状态容器"]

        subgraph PAGES["页面"]
            HOME["HomePage<br/>上传入口"]
            WORKSPACE["WorkspacePage<br/>编辑工作区"]
            GLOSSARY_PAGE["GlossaryManager<br/>术语管理"]
            DOWNLOAD_PAGE["DownloadPage<br/>视频下载"]
            COMPRESS_PAGE["CompressionPage<br/>视频压制"]
            E2E_WIZARD["EndToEndWizard<br/>全自动处理"]
        end

        APP --> PAGES
    end

    subgraph HOOKS_LAYER["状态层 (Hooks Layer)"]
        direction LR

        subgraph CORE_HOOKS["核心 Hooks"]
            USE_WORKSPACE["useWorkspaceLogic<br/>工作区逻辑入口"]
            USE_AUTO_SAVE["useAutoSave"]
            USE_FILE_OPS["useFileOperations"]
            USE_GENERATION["useGeneration"]
            USE_BATCH["useBatchActions"]
            USE_SETTINGS["useSettings<br/>设置持久化"]
        end

        subgraph FEATURE_HOOKS["功能 Hooks"]
            USE_GLOSSARY["useGlossaryFlow<br/>术语流程"]
            USE_SNAPSHOTS["useSnapshots<br/>版本快照"]
            USE_DOWNLOAD["useDownload<br/>下载逻辑"]
            USE_TOAST["useToast<br/>通知系统"]
            USE_E2E["useEndToEnd<br/>流水线状态"]
        end
    end

    subgraph SERVICES_LAYER["服务层 (Services Layer)"]
        direction TB

        subgraph API_SVC["API 服务"]
            direction LR
            GEMINI_CORE["gemini/core/<br/>client.ts (Client & Config)"]
            OPENAI_SVC2["openai/<br/>transcribe.ts"]
            WHISPER_SVC["whisper-local/<br/>transcribe.ts"]
        end

        subgraph GENERATION_SVC["生成服务 (New)"]
            direction TB
            PIPELINE["pipeline/<br/>index.ts (Orchestrator)<br/>chunkProcessor.ts"]
            EXTRACTORS["extractors/<br/>glossary.ts<br/>speakerProfile.ts"]
            BATCH_OPS["batch/<br/>operations.ts"]
        end

        subgraph AUDIO_SVC["音频服务"]
            direction LR
            SEGMENTER_SVC["segmenter.ts (17KB)<br/>SmartSegmenter"]
            SAMPLER_SVC["sampler.ts (12KB)<br/>智能采样"]
            DECODER_SVC["decoder.ts<br/>音频解码"]
        end

        subgraph SUBTITLE_SVC["字幕服务"]
            direction LR
            PARSER_SVC["parser.ts (13KB)<br/>多格式解析"]
            GENERATOR_SVC["generator.ts<br/>格式导出"]
            TIME_SVC["time.ts<br/>时间码处理"]
        end

        subgraph GLOSSARY_SVC["术语服务"]
            direction LR
            MANAGER_SVC["manager.ts<br/>术语管理"]
            MERGER_SVC["merger.ts<br/>术语合并"]
            SELECTOR_SVC["selector.ts<br/>片段选择"]
        end

        subgraph DOWNLOAD_SVC["下载服务"]
            direction LR
            DL_SVC["download.ts<br/>下载逻辑"]
            DL_TYPES["types.ts<br/>下载类型"]
        end
    end

    subgraph INFRA_LAYER["基础设施层 (Infrastructure)"]
        direction LR

        subgraph UTILS["工具"]
            CONCURRENCY["concurrency.ts<br/>Semaphore"]
            LOGGER["logger.ts<br/>日志系统"]
            ENV["env.ts<br/>环境变量"]
            SNAPSHOT["snapshotStorage.ts<br/>快照持久化"]
        end

        subgraph WORKERS_GROUP["Workers"]
            VAD_WORKER["vad.worker.ts<br/>VAD 后台"]
            PARSER_WORKER["parser.worker.ts<br/>解析后台"]
        end

        subgraph TYPES_GROUP["类型"]
            SUBTITLE_TYPE["subtitle.ts"]
            SETTINGS_TYPE["settings.ts"]
            API_TYPE["api.ts"]
            GLOSSARY_TYPE["glossary.ts"]
        end
    end

    subgraph ELECTRON_LAYER["Electron 层 (Desktop Only)"]
        direction LR
        MAIN_PROCESS["main.ts (15KB)<br/>主进程"]
        PRELOAD_SCRIPT["preload.ts<br/>安全桥接"]

        subgraph ELECTRON_SVC["桌面服务"]
            LOCAL_WHISPER_SVC["localWhisper.ts (13KB)"]
            FFMPEG_SVC["ffmpegAudioExtractor.ts"]
            COMPRESSOR_SVC["videoCompressor.ts"]
            YTDLP_SVC["ytdlp.ts"]
            PIPELINE_SVC["endToEndPipeline.ts<br/>全自动流水线"]
            PREVIEW_SVC["videoPreviewTranscoder.ts<br/>视频预览与缓存"]
            STORAGE_SVC["storage.ts"]
            LOGGER_SVC["logger.ts"]
        end

        MAIN_PROCESS --> ELECTRON_SVC
        PIPELINE_SVC -.-> YTDLP_SVC
        PIPELINE_SVC -.-> COMPRESSOR_SVC
        ELECTRON_SVC -.-> PREVIEW_SVC
    end

    APP_LAYER --> HOOKS_LAYER
    HOOKS_LAYER --> SERVICES_LAYER
    SERVICES_LAYER --> INFRA_LAYER
    SERVICES_LAYER -.->|"Electron Only"| ELECTRON_LAYER
```

### 模块依赖关系图

```mermaid
flowchart LR
    subgraph ENTRY["入口"]
        PIPELINE_IDX["generation/pipeline/index.ts<br/>generateSubtitles()"]
    end

    subgraph EXTRACTORS_DEPS["提取器"]
        GLOSSARY_EXT["extractors/glossary.ts"]
        SPEAKER_EXT["extractors/speakerProfile.ts"]
    end

    subgraph CORE_DEPS["核心依赖"]
        BATCH_OPS["generation/batch/operations.ts"]
        GEMINI_CLIENT["api/gemini/core/client.ts"]
        PROMPTS_TS["api/gemini/core/prompts.ts"]
        SCHEMAS_TS["api/gemini/core/schemas.ts"]
    end

    subgraph AUDIO_DEPS["音频依赖"]
        SEGMENTER_TS["segmenter.ts<br/>SmartSegmenter"]
        SAMPLER_TS["sampler.ts<br/>intelligentSampling()"]
        DECODER_TS["decoder.ts"]
        PROCESSOR_TS["processor.ts<br/>sliceAudioBuffer()"]
    end

    subgraph TRANSCRIBE_DEPS["转写依赖"]
        OPENAI_TRANSCRIBE["openai/transcribe.ts"]
        LOCAL_TRANSCRIBE["whisper-local/transcribe.ts"]
    end

    subgraph UTIL_DEPS["工具依赖"]
        CONCURRENCY_TS["concurrency.ts<br/>Semaphore, mapInParallel"]
        LOGGER_TS["logger.ts"]
        PRICING_TS["pricing.ts"]
    end

    subgraph DOWNLOAD_DEPS["下载依赖"]
        DOWNLOAD_TS["download/download.ts"]
        DOWNLOAD_UTILS["download/utils.ts"]
    end

    DOWNLOAD_TS --> DOWNLOAD_UTILS
    DOWNLOAD_TS --> LOGGER_TS

    PIPELINE_IDX --> EXTRACTORS_DEPS
    PIPELINE_IDX --> BATCH_OPS
    PIPELINE_IDX --> SEGMENTER_TS
    PIPELINE_IDX --> TRANSCRIBE_DEPS

    EXTRACTORS_DEPS --> GEMINI_CLIENT
    EXTRACTORS_DEPS --> SAMPLER_TS
    BATCH_OPS --> GEMINI_CLIENT
    GEMINI_CLIENT --> PROMPTS_TS
    GEMINI_CLIENT --> SCHEMAS_TS

    SEGMENTER_TS --> DECODER_TS
    SAMPLER_TS --> PROCESSOR_TS

    SUBTITLE_TS --> CONCURRENCY_TS
    CLIENT_TS --> LOGGER_TS
    SUBTITLE_TS --> PRICING_TS
```

---

## 📁 目录结构

```
Gemini-Subtitle-Pro/
├── 📂 src/                          # 前端源代码
│   ├── 📄 App.tsx                   # 应用主入口
│   ├── 📄 index.tsx                 # React 渲染入口
│   ├── 📄 index.css                 # 全局样式
│   ├── 📄 i18n.ts                   # [NEW] 国际化配置入口
│   │
│   ├── 📂 components/               # UI 组件
│   │   ├── 📂 common/               # 通用业务组件 (Header, PageHeader 等)
│   │   ├── 📂 editor/               # 字幕编辑器组件 (SubtitleRow, Batch 等)
│   │   ├── 📂 pages/                # 页面级组件 (HomePage, WorkspacePage 等)
│   │   ├── 📂 ui/                   # 基础 UI 组件库 (Modal, Toggle, TextInput...)
│   │   ├── 📂 settings/             # 设置相关组件 (SettingsModal, SettingsPanel 等)
│   │   ├── 📂 layout/               # 布局容器
│   │   ├── 📂 modals/               # 业务弹窗 (SettingsModal 等)
│   │   ├── 📂 endToEnd/             # 端到端向导组件
│   │   └── 📂 ...                   # 其他按照功能划分的组件目录
│   │
│   ├── 📂 hooks/                    # React Hooks
│   │   ├── 📂 useWorkspaceLogic/    # 核心工作区逻辑 (拆分为多模块)
│   │   │   ├── 📄 index.ts          # 入口
│   │   │   └── 📄 ...               # 子逻辑 Hook
│   │   ├── 📄 useHardwareAcceleration.ts # 硬件加速状态
│   │   ├── 📄 useSettings.ts        # 设置管理
│   │   ├── 📄 useDownload.ts        # 下载逻辑
│   │   └── ...                      # 其他功能 Hooks
│   │
│   ├── 📂 locales/                  # [NEW] 国际化资源目录
│   │   ├── 📂 zh-CN/                # 简体中文
│   │   │   ├── 📄 common.json       # 通用文本
│   │   │   ├── 📄 home.json         # 首页
│   │   │   ├── 📄 editor.json       # 编辑器
│   │   │   ├── 📄 settings.json     # 设置
│   │   │   ├── 📄 endToEnd.json     # 端到端向导
│   │   │   └── 📄 ...               # 其他命名空间
│   │   └── 📂 en-US/                # 英语
│   │       └── 📄 ...               # 相同结构
│   │
│   ├── 📂 services/                 # 服务层 (纯逻辑)
│   │   ├── 📂 api/                  # API 集成 (Gemini Core, OpenAI)
│   │   │   └── 📂 gemini/           # Gemini 基础客户端与配置
│   │   │       ├── 📂 core/         # 核心 API 逻辑
│   │   │       └── 📂 utils/        # API 工具函数
│   │   ├── 📂 generation/           # 生成服务 (核心业务逻辑)
│   │   │   ├── 📂 pipeline/         # 完整流水线 (Orchestrator, ChunkProcessor)
│   │   │   ├── 📂 extractors/       # 信息提取 (Glossary, Speaker)
│   │   │   ├── 📂 batch/            # 批量操作
│   │   │   └── 📂 debug/            # 调试工具
│   │   ├── 📂 audio/                # 音频处理 (Segmenter, Sampler)
│   │   ├── 📂 subtitle/             # 字幕解析与生成 (Parser, Generator)
│   │   ├── 📂 download/             # 下载服务逻辑
│   │   └── 📂 utils/                # 通用服务工具 (Logger, URL 验证)
│   │
│   ├── 📂 config/                   # 配置模块
│   │   ├── 📄 index.ts              # 配置导出入口
│   │   └── 📄 models.ts             # 模型配置 (步骤→模型映射)
│   │
│   ├── 📂 lib/                      # 通用库
│   │   ├── 📄 cn.ts                 # Tailwind 类名合并工具
│   │   └── 📄 text.ts               # 文本处理工具
│   │
│   ├── 📂 types/                    # TypeScript 类型定义
│   └── 📂 workers/                  # Web Workers
│
├── 📂 electron/                     # Electron 桌面端代码
│   ├── 📄 main.ts                   # 主进程入口
│   ├── 📄 preload.ts                # 预加载脚本
│   └── 📂 services/                 # 桌面端服务 (Node.js 环境)
│       ├── 📄 localWhisper.ts       # 本地 Whisper 调用
│       ├── 📄 videoPreviewTranscoder.ts # [NEW] 视频预览与缓存
│       ├── 📄 logger.ts             # 统一日志服务
│       └── ...                      # 其他系统级服务
│
└── 📄 package.json                  # 项目配置
```

---

## 🔄 核心流程图

### 1. 完整 Pipeline 并发架构

下图展示了字幕生成的完整并发架构，包括并行异步任务、Semaphore 控制和跨任务依赖关系：

```mermaid
flowchart TB
    subgraph INIT["🎬 初始化阶段"]
        A[音频/视频文件] --> B[音频解码]
        B --> C{智能分段?}
        C -->|是| D["VAD 智能切分<br/>(Silero VAD)"]
        C -->|否| E[固定时长切分]
        D --> F[音频片段列表]
        E --> F
        D --> G["缓存 VAD Segments<br/>(供说话人采样复用)"]
    end

    subgraph PARALLEL["⚡ 并行异步任务 (Promise)"]
        direction TB

        subgraph GLOSSARY["📚 术语提取 Pipeline"]
            H["glossaryPromise<br/>(Gemini 3 Pro)"]
            H --> I[选择采样片段]
            I --> J["并发提取术语<br/>(concurrencyPro=2)"]
            J --> K[Search Grounding 验证]
            K --> L["⏸️ 等待用户确认<br/>(BLOCKING)"]
            L --> M["GlossaryState<br/>(Non-blocking Wrapper)"]
        end

        subgraph SPEAKER["🗣️ 说话人识别 Pipeline"]
            N["speakerProfilePromise<br/>(Gemini 3 Pro)"]
            N --> O["智能音频采样<br/>(复用 VAD Segments)"]
            O --> P[提取说话人档案]
            P --> Q["SpeakerProfile[]<br/>{name, style, tone, catchphrases}"]
        end
    end

    subgraph CHUNKS["🔄 Chunk 并行处理 (mapInParallel)"]
        direction TB

        subgraph CHUNK1["Chunk 1"]
            C1_T["Transcription<br/>⏳ 等待 transcriptionSemaphore"]
            C1_T --> C1_G["⏳ await glossaryState.get()"]
            C1_G --> C1_S["⏳ await speakerProfiles"]
            C1_S --> C1_R["Refinement<br/>⏳ 等待 refinementSemaphore"]
            C1_R --> C1_TR[Translation]
        end

        subgraph CHUNK2["Chunk 2"]
            C2_T["Transcription<br/>⏳ 等待 transcriptionSemaphore"]
            C2_T --> C2_G["⏳ await glossaryState.get()"]
            C2_G --> C2_S["⏳ await speakerProfiles"]
            C2_S --> C2_R["Refinement<br/>⏳ 等待 refinementSemaphore"]
            C2_R --> C2_TR[Translation]
        end

        subgraph CHUNKN["Chunk N..."]
            CN_T["Transcription"]
            CN_T --> CN_G["等待术语表"]
            CN_G --> CN_S["等待说话人"]
            CN_S --> CN_R["Refinement"]
            CN_R --> CN_TR[Translation]
        end
    end

    F --> PARALLEL
    G --> O
    F --> CHUNKS
    M -.->|"非阻塞访问"| C1_G
    M -.->|"非阻塞访问"| C2_G
    Q -.->|"等待完成"| C1_S
    Q -.->|"等待完成"| C2_S

    subgraph MERGE["📦 合并结果"]
        R[合并所有 Chunk 结果]
        R --> S[重新编号字幕 ID]
        S --> T[Token 用量报告]
    end

    CHUNKS --> MERGE
```

---

### 2. 双 Semaphore 并发控制详解

```mermaid
flowchart LR
    subgraph SEMAPHORES["🔒 Semaphore 资源池"]
        subgraph TRANS["transcriptionSemaphore"]
            T1["Slot 1"]
            T2["Slot 2<br/>(本地 Whisper 默认 1)"]
        end

        subgraph REFINE["refinementSemaphore"]
            R1["Slot 1"]
            R2["Slot 2"]
            R3["Slot 3"]
            R4["Slot 4"]
            R5["Slot 5<br/>(Flash 默认 5)"]
        end
    end

    subgraph CHUNKS["Chunks 排队"]
        C1["Chunk 1"]
        C2["Chunk 2"]
        C3["Chunk 3"]
        C4["Chunk 4"]
        C5["Chunk 5"]
        C6["Chunk 6"]
    end

    C1 -->|"acquire()"| T1
    C2 -->|"acquire()"| T2
    C3 -->|"等待..."| TRANS

    C1 -->|"转录完成后"| R1
    C2 -->|"转录完成后"| R2
    C4 -->|"acquire()"| R3
```

**配置说明：**

| Semaphore                | 用途                  | 默认并发数       | 配置项               |
| ------------------------ | --------------------- | ---------------- | -------------------- |
| `transcriptionSemaphore` | 控制 Whisper API 调用 | 本地: 1, 云端: 5 | `whisperConcurrency` |
| `refinementSemaphore`    | 控制 Gemini Flash API | 5                | `concurrencyFlash`   |
| (术语提取内部)           | 控制 Gemini Pro API   | 2                | `concurrencyPro`     |

---

### 3. Chunk 内部 4 阶段流水线

```mermaid
sequenceDiagram
    participant Chunk as Chunk N
    participant TSem as transcriptionSemaphore
    participant Whisper as Whisper API
    participant GState as GlossaryState
    participant SProm as speakerProfilePromise
    participant RSem as refinementSemaphore
    participant Gemini as Gemini Flash

    Note over Chunk: Stage 1: Transcription
    Chunk->>TSem: acquire()
    activate TSem
    TSem-->>Chunk: 获得许可
    Chunk->>Whisper: transcribe(audioChunk)
    Whisper-->>Chunk: rawSegments[]
    Chunk->>TSem: release()
    deactivate TSem

    Note over Chunk: Stage 2: Wait for Glossary (Non-blocking)
    Chunk->>GState: await get()
    Note right of GState: 如果术语提取尚未完成<br/>或用户尚未确认，则等待
    GState-->>Chunk: finalGlossary[]

    Note over Chunk: Stage 3: Wait for Speaker Profiles
    Chunk->>SProm: await speakerProfiles
    Note right of SProm: 如果说话人识别尚未完成则等待
    SProm-->>Chunk: SpeakerProfile[]

    Note over Chunk: Stage 4: Refinement + Translation
    Chunk->>RSem: acquire()
    activate RSem
    RSem-->>Chunk: 获得许可

    Chunk->>Gemini: Refinement (音频+原文)
    Note right of Gemini: 时间轴校正<br/>术语应用<br/>说话人匹配
    Gemini-->>Chunk: refinedSegments[]

    Chunk->>Gemini: Translation (批量)
    Gemini-->>Chunk: translatedItems[]

    Chunk->>RSem: release()
    deactivate RSem

    Note over Chunk: 完成，更新中间结果
```

---

### 4. 术语提取与用户交互流程

```mermaid
sequenceDiagram
    participant Pipeline as generateSubtitles
    participant Glossary as extractGlossaryFromAudio
    participant Pro as Gemini 3 Pro
    participant State as GlossaryState
    participant UI as 用户界面
    participant Chunks as Chunk Workers

    Note over Pipeline: 启动并行术语提取
    Pipeline->>+Glossary: glossaryPromise = extract()
    Pipeline->>State: new GlossaryState(promise)
    Note over State: 包装 Promise 为非阻塞访问器

    par 术语提取并行进行
        loop 采样片段并发处理 (concurrencyPro=2)
            Glossary->>Pro: 发送音频片段
            Pro->>Pro: Search Grounding 验证
            Pro-->>Glossary: GlossaryExtractionResult
        end
    and Chunks 可以开始转录
        Chunks->>Chunks: 开始 Transcription 阶段
        Chunks->>State: await get()
        Note over State: Chunks 在此等待术语表
    end

    Glossary-->>-Pipeline: extractedResults[]

    Note over Pipeline: 等待用户确认 (BLOCKING)
    Pipeline->>UI: onGlossaryReady(metadata)
    UI->>UI: 显示术语表弹窗
    UI-->>Pipeline: confirmedGlossary[]

    Pipeline->>State: resolve(confirmedGlossary)
    Note over State: 所有等待的 Chunks 被唤醒

    State-->>Chunks: finalGlossary[]
    Note over Chunks: 继续进入 Refinement 阶段
```

---

### 5. 说话人识别在 Pipeline 中的位置

```mermaid
flowchart TB
    subgraph PARALLEL["并行启动的 Promise"]
        GP["glossaryPromise<br/>术语提取"]
        SP["speakerProfilePromise<br/>说话人识别"]
    end

    subgraph CHUNK["每个 Chunk 的处理流程"]
        T["Transcription<br/>(独立进行)"]
        WG["等待 glossaryState.get()"]
        WS["等待 speakerProfiles"]
        R["Refinement<br/>(合并使用术语+说话人)"]
        TR["Translation"]

        T --> WG
        WG --> WS
        WS --> R
        R --> TR
    end

    GP -.->|"用户确认后"| WG
    SP -.->|"提取完成后"| WS

    subgraph REFINEMENT["Refinement 阶段使用"]
        G["术语表 → 纠正识别错误"]
        S["说话人档案 → 匹配发言者"]
        G --> PROMPT["系统 Prompt"]
        S --> PROMPT
    end

    R --> REFINEMENT
```

**Pipeline 依赖关系总结：**

| 阶段          | 依赖项                                | 说明                   |
| ------------- | ------------------------------------- | ---------------------- |
| Transcription | `transcriptionSemaphore`              | 独立执行，无阻塞依赖   |
| Wait Glossary | `glossaryState.get()`                 | 必须等待术语确认完成   |
| Wait Speakers | `speakerProfilePromise`               | 必须等待说话人识别完成 |
| Refinement    | `refinementSemaphore` + 术语 + 说话人 | 合并使用所有数据       |
| Translation   | (在 Refinement Semaphore 内)          | 随 Refinement 一起完成 |

---

### 6. 桌面端全流程 (下载-制作-压制)

桌面版独有的完整工作流，打通了从素材获取到成片输出的链路：

```mermaid
flowchart LR
    subgraph DOWNLOAD["📥 资源获取"]
        direction TB
        YTB["YouTube<br/>(yt-dlp)"]
        BILI["Bilibili<br/>(yt-dlp)"]
        LOCAL_FILE["本地视频文件"]

        YTB --> DOWNLOADER["视频下载器"]
        BILI --> DOWNLOADER
        DOWNLOADER --> LOCAL_FILE
    end

    subgraph PROCESS["⚙️ 字幕制作"]
        direction TB
        LOCAL_FILE --> IMPORT["导入/解码"]
        IMPORT --> GEN["AI 字幕生成<br/>(Whisper + Gemini)"]
        GEN --> EDIT["工作区编辑/校对"]

        EDIT --> SRT_ASS["导出字幕文件<br/>(.srt / .ass)"]
    end

    subgraph COMPRESS["🎬 成片压制"]
        direction TB
        LOCAL_FILE --> COMPRESSOR["视频压制引擎<br/>(FFmpeg)"]
        EDIT -.->|"自动传递字幕路径"| COMPRESSOR
        SRT_ASS -.->|"手动选择字幕"| COMPRESSOR

        COMPRESSOR --> OUTPUT["硬字幕视频<br/>(Hardsub Video)"]
    end

    DOWNLOAD --> PROCESS
    PROCESS --> COMPRESS
```

---

### 7. 全自动端到端模式 (End-to-End Pipeline)

这是 Electron 端独有的核心功能，通过 IPC 通信协调主进程（资源调度）与渲染进程（AI 运算），实现"一键熟肉"。

#### 7.1 跨进程交互架构

```mermaid
sequenceDiagram
    participant User as 用户输入
    participant Main as 🖥️ 主进程 (Node.js)
    participant Renderer as 🎨 渲染进程 (Web)
    participant Ext as 🛠️ 外部工具 (yt-dlp/ffmpeg)
    participant AI as ☁️ AI 服务 (Gemini/OpenAI)

    User->>Main: 1. 提交视频 URL
    activate Main

    note over Main: [Phase 1: 资源准备]
    Main->>Ext: 调用 yt-dlp 下载
    Ext-->>Main: 原始视频 (.mp4)
    Main->>Ext: 调用 ffmpeg 提取音频
    Ext-->>Main: 临时音频 (.wav)

    note over Main: [Phase 2: 渲染进程接管]
    Main->>Renderer: IPC: generate-subtitles
    activate Renderer

    note right of Renderer: useEndToEndSubtitleGeneration
    Renderer->>Main: IPC: read-focal-file
    Main-->>Renderer: Audio Buffer

    Renderer->>AI: 1. Whisper 转写
    Renderer->>AI: 2. Gemini 术语提取
    Renderer->>AI: 3. Gemini 说话人分析
    Renderer->>AI: 4. Gemini 翻译润色

    AI-->>Renderer: SUBTITLE_DATA

    Renderer->>Main: IPC: subtitle-result (JSON)
    deactivate Renderer

    note over Main: [Phase 3: 后处理]
    Main->>Main: jsonToAss/Srt()
    Main->>Main: 写入本地磁盘

    opt Video Compression
        Main->>Ext: ffmpeg 视频压制 (Hardsub)
        Ext-->>Main: 成片视频
    end

    Main->>User: 任务完成通知
    deactivate Main
```

#### 7.2 数据流向与状态管理

所有中间状态和配置通过 `EndToEndWizard` 组件管理，数据流转如下：

1.  **用户配置 (Configuration)**
    - 源: `EndToEndWizard` UI
    - 流向: 通过 `IPC (start-processing)` -> 主进程 `EndToEndPipeline` 服务
    - 内容: URL, 模型选择, 翻译风格, 压制参数

2.  **音视频流 (Media Stream)**
    - `yt-dlp` -> 磁盘临时目录 -> `ffmpeg` (提取音频) -> 磁盘 WAV
    - 磁盘 WAV -> `IPC (read-file)` -> 渲染进程内存 (ArrayBuffer) -> Web Audio API

3.  **字幕数据 (Subtitle Data)**
    - 渲染进程生成 `SubtitleItem[]` 数组
    - 通过 `IPC (subtitle-result)` 回传主进程
    - 主进程将对象序列化为 ASS/SRT 格式文本并写入文件

4.  **进度反馈 (Progress Feedback)**
    - 各阶段 (下载/转写/压制) 均产生进度事件
    - 主进程 -> `IPC (progress)` -> 渲染进程 `useEndToEnd` Hook -> UI 进度条

#### 7.3 关键 IPC 通道

| 通道名 (Channel)                | 方向             | 载荷 (Payload)    | 作用                               |
| :------------------------------ | :--------------- | :---------------- | :--------------------------------- |
| `end-to-end:start`              | Renderer -> Main | `EndToEndConfig`  | 启动全自动任务                     |
| `end-to-end:generate-subtitles` | Main -> Renderer | `path, config`    | 主进程准备好音频，请求前端开始生成 |
| `end-to-end:subtitle-result`    | Renderer -> Main | `SubtitleItem[]`  | 前端完成生成，返回结果             |
| `end-to-end:progress`           | Main -> Renderer | `stage, progress` | 实时进度同步                       |

---

## 🛰️ 媒体播放自定义协议

为了绕过浏览器的安全限制（CSP、沙箱）并支持大文件流式播放，桌面版实现了一个自定义协议：

### `local-video://` 协议

- **实现位置**：`electron/main.ts`
- **核心权限**：`standard`, `secure`, `stream`, `supportFetchAPI`, `bypassCSP`。
- **关键技术：Tailing Reader**：支持读取“增长中的文件”（转码进行中）。它使用轮询机制读取 FFmpeg 正在写入磁盘的新数据。

---

## 📺 视频预览与缓存策略

系统采用分片 MP4 (fragmented MP4) 转码策略，平衡兼容性与性能。

### 流程图

```mermaid
sequenceDiagram
    participant R as 渲染进程 (VideoPlayer)
    participant M as 主进程 (PreviewTranscoder)
    participant F as FFmpeg
    participant C as 磁盘缓存 (Disk Cache)

    R->>M: IPC (video-preview:transcode)
    M->>M: 检查是否需要转码 (编码格式检查)
    alt 已缓存且有效
        M-->>R: 返回缓存路径
    else 需要转码
        M->>F: 启动 ffmpeg (分片 mp4)
        F-->>C: 将 .mp4 流写入缓存
        M-->>R: IPC (transcode-start)
        R->>R: 加载 local-video://缓存路径
        Note over R,C: TailingReader 从缓存流式读取
    end
```

### 缓存生命周期

- **存储位置**：用户数据目录 (`/preview_cache/`)。
- **限制**：自动执行总大小限制（如 2GB）。
- **清理**：应用启动时自动检测，并支持 UI 手动清理。
  | `video-preview:transcode` | Renderer -> Main | `{ filePath }` | 请求视频预览转码 |
  | `video-preview:transcode-start` | Main -> Renderer | `{ outputPath }` | 转码已开始 |
  | `video-preview:transcode-progress` | Main -> Renderer | `{ percent }` | 转码进度更新 |
  | `video-preview:needs-transcode` | Renderer -> Main | `filePath` | 检查视频是否需要转码 |
  | `cache:get-size` | Renderer -> Main | - | 获取预览缓存大小 |
  | `cache:clear` | Renderer -> Main | - | 清理预览缓存 |

---

## 🧩 核心模块说明

### 1. 生成服务模块 (`src/services/generation/`) [NEW]

这是重构后的核心业务逻辑模块，将原有的 Gemini API 逻辑按职责拆分：

| 子模块       | 文件/目录               | 功能描述                                                |
| ------------ | ----------------------- | ------------------------------------------------------- |
| `pipeline`   | `index.ts`              | 生成流程总管 (Orchestrator)，协调转写、提取、生成全流程 |
|              | `chunkProcessor.ts`     | 单个 Chunk 的处理逻辑 (转写 -> 术语/说话人等待 -> 翻译) |
|              | `translation.ts`        | 具体翻译执行逻辑                                        |
|              | `glossaryHandler.ts`    | 术语应用逻辑                                            |
|              | `resultTransformers.ts` | 结果转换与后处理逻辑                                    |
| `extractors` | `glossary.ts`           | 术语提取器 (Gemini Pro + Search)                        |
|              | `speakerProfile.ts`     | 说话人档案提取器                                        |
| `batch`      | `operations.ts`         | 批量校对与时间轴修复操作                                |

### 2. Gemini API 核心 (`src/services/api/gemini/core/`)

只保留最基础的 API 交互能力：

| 文件         | 功能描述                                         |
| ------------ | ------------------------------------------------ |
| `client.ts`  | Gemini API 客户端封装，处理 auth、retry 和 quota |
| `prompts.ts` | 基础 Prompt 模板库                               |
| `schemas.ts` | 结构化输出的 Schema 定义                         |

### 3. 音频处理模块 (`src/services/audio/`)

| 文件                 | 功能描述                                                             |
| -------------------- | -------------------------------------------------------------------- |
| `segmenter.ts`       | **智能音频切分器**，使用 Silero VAD 模型检测语音活动，按语义边界切分 |
| `sampler.ts`         | 音频采样，生成用于 AI 分析的音频样本                                 |
| `decoder.ts`         | 音频解码，支持多种格式                                               |
| `processor.ts`       | 音频预处理，归一化等                                                 |
| `converter.ts`       | 音频格式转换                                                         |
| `ffmpegExtractor.ts` | FFmpeg 音频提取 (核心逻辑)                                           |

### 4. 字幕处理模块 (`src/services/subtitle/`)

| 文件                   | 功能描述                            |
| ---------------------- | ----------------------------------- |
| `parser.ts`            | 字幕解析器，支持 SRT/ASS/VTT 等格式 |
| `generator.ts`         | 字幕导出，生成双语字幕文件          |
| `time.ts`              | 时间码处理工具                      |
| `postCheck.ts`         | 字幕质量后检查                      |
| `timelineValidator.ts` | 字幕时间轴逻辑校验                  |

### 5. 下载服务模块 (`src/services/download/`)

| 文件          | 功能描述         |
| ------------- | ---------------- |
| `download.ts` | 视频下载逻辑封装 |
| `utils.ts`    | 下载相关工具函数 |

### 6. Electron 桌面端 (`electron/`)

| 文件                               | 功能描述                                   |
| ---------------------------------- | ------------------------------------------ |
| `main.ts`                          | Electron 主进程，窗口管理、IPC 通信        |
| `preload.ts`                       | 预加载脚本，暴露安全的 Node.js API         |
| `logger.ts`                        | **统一日志系统**，支持文件轮转和多级别日志 |
| `services/localWhisper.ts`         | 本地 Whisper 模型调用 (whisper.cpp)        |
| `services/ffmpegAudioExtractor.ts` | FFmpeg 音频提取，支持视频文件              |
| `services/ytdlp.ts`                | 视频下载服务 (YouTube/Bilibili)            |
| `services/videoCompressor.ts`      | 视频压制服务 (支持 GPU 加速)               |
| `services/endToEndPipeline.ts`     | **全自动流水线**，编排下载-转写-压制全流程 |

### 7. 国际化模块 (`src/locales/`, `src/i18n.ts`) [NEW]

基于 i18next 实现的完整国际化支持，提供中英双语界面：

| 文件/目录  | 功能描述                                     |
| ---------- | -------------------------------------------- |
| `i18n.ts`  | 国际化配置入口，初始化 i18next 和 React 绑定 |
| `locales/` | 翻译资源根目录                               |
| `zh-CN/`   | 简体中文翻译，包含 14 个命名空间文件         |
| `en-US/`   | 英文翻译，与 zh-CN 结构相同                  |

**命名空间组织：**

| 命名空间      | 内容                        |
| ------------- | --------------------------- |
| `common`      | 通用文本 (按钮、标签、错误) |
| `home`        | 首页内容                    |
| `workspace`   | 工作区页面                  |
| `editor`      | 字幕编辑器                  |
| `settings`    | 设置弹窗                    |
| `endToEnd`    | 端到端向导                  |
| `modals`      | 业务弹窗                    |
| `services`    | API 服务消息                |
| `compression` | 视频压制页面                |
| `download`    | 下载页面                    |
| `progress`    | 进度指示器                  |
| `ui`          | UI 组件                     |
| `app`         | 应用级文本                  |

---

## 🔧 技术特点

### 并发控制

```typescript
// 使用 Semaphore 控制并发数
const semaphore = new Semaphore(concurrency);
await mapInParallel(chunks, async (chunk) => {
  await semaphore.acquire();
  try {
    return await processChunk(chunk);
  } finally {
    semaphore.release();
  }
});
```

### 模型选择策略

模型配置集中在 `src/config/models.ts`，支持按处理步骤选择不同模型：

| 处理步骤             | 默认模型               | 特点                             |
| -------------------- | ---------------------- | -------------------------------- |
| `refinement`         | Gemini 2.5 Flash       | 时间轴校正 (规避 3.0 时间戳 Bug) |
| `translation`        | Gemini 3 Flash Preview | 翻译、Search Grounding           |
| `glossaryExtraction` | Gemini 3 Pro Preview   | 多模态、术语提取                 |
| `speakerProfile`     | Gemini 3 Pro Preview   | 说话人分析                       |
| `batchProofread`     | Gemini 3 Pro Preview   | 高质量校对、Search Grounding     |
| `batchFixTimestamps` | Gemini 2.5 Flash       | 时间轴修复                       |

每个步骤可独立配置：

- `thinkingLevel`: 思考深度 (`none`/`low`/`medium`/`high`)
- `useSearch`: 是否启用 Google Search
- `maxOutputTokens`: 最大输出 Token 数

### 重试机制

```typescript
// 自动重试可恢复的错误
async function generateContentWithRetry(
  ai: GoogleGenAI,
  params: any,
  retries = 3,
  signal?: AbortSignal,
  onUsage?: (usage: TokenUsage) => void,
  timeoutMs?: number
);
```

---

## 📊 数据流架构

### 主数据流图

```mermaid
flowchart TB
    subgraph INPUT["📥 输入层"]
        direction LR
        URL["视频链接<br/>(URL)"]
        FILE["媒体文件<br/>(MP4/MP3/WAV)"]
        SRT_IN["已有字幕<br/>(SRT/ASS/VTT)"]
        GLOSSARY_IN["术语表<br/>(JSON)"]
        SETTINGS_IN["用户设置<br/>(AppSettings)"]
    end

    subgraph DECODE["🔊 解码层"]
        direction LR
        FFMPEG_EXTRACT["FFmpeg 提取<br/>(Electron)"]
        WEB_DECODE["Web Audio API<br/>(Browser)"]

        FILE --> FFMPEG_EXTRACT
        FILE --> WEB_DECODE
        FFMPEG_EXTRACT --> AUDIO_BUFFER["AudioBuffer<br/>PCM 数据"]
        WEB_DECODE --> AUDIO_BUFFER
    end

    subgraph SEGMENT["✂️ 分段层"]
        direction TB
        AUDIO_BUFFER --> VAD["Silero VAD<br/>语音活动检测"]
        VAD --> SEGMENTS["VAD Segments<br/>{start, end}[]"]
        SEGMENTS --> SMART_SPLIT["智能切分<br/>5-10分钟/片段"]
        SMART_SPLIT --> CHUNKS["AudioChunk[]<br/>多个音频片段"]
        SEGMENTS --> SAMPLE_SELECT["采样片段选择<br/>(术语/说话人用)"]
    end

    subgraph PARALLEL_EXTRACT["⚡ 并行提取层"]
        direction LR

        subgraph GLOSSARY_EXTRACT["术语提取"]
            SAMPLE_SELECT --> AUDIO_SAMPLE1["采样音频"]
            AUDIO_SAMPLE1 --> GEMINI_PRO1["Gemini 3 Pro<br/>+ Search Grounding"]
            GEMINI_PRO1 --> RAW_TERMS["GlossaryExtractionResult[]"]
            RAW_TERMS --> USER_CONFIRM["用户确认"]
            USER_CONFIRM --> FINAL_GLOSSARY["最终术语表<br/>GlossaryItem[]"]
        end

        subgraph SPEAKER_EXTRACT["说话人提取"]
            SAMPLE_SELECT --> AUDIO_SAMPLE2["采样音频"]
            AUDIO_SAMPLE2 --> GEMINI_PRO2["Gemini 3 Pro"]
            GEMINI_PRO2 --> SPEAKER_PROFILES["SpeakerProfile[]<br/>{id, name, style, tone}"]
        end
    end

    subgraph CHUNK_PIPELINE["🔄 Chunk 处理流水线"]
        direction TB

        CHUNKS --> TRANSCRIBE["Whisper 转写<br/>(云端/本地)"]
        TRANSCRIBE --> RAW_SUBS["原始字幕<br/>{startTime, endTime, original}[]"]

        RAW_SUBS --> WAIT_DEPS["等待依赖"]
        FINAL_GLOSSARY -.-> WAIT_DEPS
        SPEAKER_PROFILES -.-> WAIT_DEPS

        WAIT_DEPS --> REFINEMENT["Gemini 3 Flash<br/>校对 & 时间轴修正"]
        REFINEMENT --> REFINED_SUBS["校对字幕<br/>+ speaker 标注"]

        REFINED_SUBS --> TRANSLATION["Gemini 3 Flash<br/>翻译"]
        TRANSLATION --> TRANSLATED_SUBS["双语字幕<br/>{original, translated, speaker}[]"]
    end

    subgraph OUTPUT["📤 输出层"]
        direction LR
        TRANSLATED_SUBS --> MERGE["合并 & 重编号"]
        MERGE --> SRT_OUT["SRT 文件<br/>(单语/双语)"]
        MERGE --> ASS_OUT["ASS 文件<br/>(样式化字幕)"]
        MERGE --> EDITOR["编辑器显示"]
        FINAL_GLOSSARY --> GLOSSARY_OUT["更新术语表<br/>(JSON)"]

        SRT_OUT -.-> VIDEO_OUT["压制视频<br/>(MP4/Hardsub)"]
    end

    SRT_IN --> REFINED_SUBS
    GLOSSARY_IN --> FINAL_GLOSSARY
    SETTINGS_IN --> TRANSCRIBE
    SETTINGS_IN --> REFINEMENT
    SETTINGS_IN --> TRANSLATION
    FILE -.-> VIDEO_OUT
```

### 数据类型转换链

```mermaid
flowchart LR
    subgraph AUDIO_CHAIN["音频数据链"]
        FILE2["File<br/>(Binary)"] --> AB["AudioBuffer<br/>(PCM Float32)"]
        AB --> WAV["Blob<br/>(WAV)"]
        WAV --> B64["Base64<br/>(for Gemini)"]
    end

    subgraph SUBTITLE_CHAIN["字幕数据链"]
        RAW["RawSegment<br/>{start, end, text}"]
        --> ITEM["SubtitleItem<br/>{id, startTime, endTime,<br/>original, translated, speaker}"]
        --> EXPORT["SRT/ASS String"]
    end

    subgraph GLOSSARY_CHAIN["术语数据链"]
        EXTRACT["GlossaryExtractionResult<br/>{chunkIndex, terms[], confidence}"]
        --> MERGE2["合并去重"]
        --> ITEM2["GlossaryItem<br/>{term, translation, category, notes}"]
    end

    subgraph SPEAKER_CHAIN["说话人数据链"]
        PROFILE["SpeakerProfile<br/>{id, characteristics}"]
        --> MATCH["说话人匹配"]
        --> SPEAKER_ID["speaker: string<br/>(字幕标注)"]
    end
```

### 状态数据流

```mermaid
stateDiagram-v2
    [*] --> Idle: 初始状态

    Idle --> Decoding: 上传文件
    Decoding --> Segmenting: 解码完成
    Segmenting --> Processing: 分段完成

    state Processing {
        [*] --> Parallel

        state Parallel {
            GlossaryExtraction --> UserConfirmation
            SpeakerExtraction --> SpeakersReady
        }

        state ChunkProcessing {
            Transcribing --> WaitingDeps
            WaitingDeps --> Refining: 依赖就绪
            Refining --> Translating
            Translating --> ChunkDone
        }

        UserConfirmation --> ChunkProcessing: 术语确认
        SpeakersReady --> ChunkProcessing: 说话人就绪
    }

    Processing --> Completed: 所有 Chunk 完成
    Completed --> [*]: 显示结果

    Idle --> Error: 解码失败
    Processing --> Error: API 错误
    Error --> Idle: 重试
```

---

## 🚀 部署架构

```mermaid
graph TB
    subgraph "Web 版部署"
        VERCEL["Vercel<br/>自动 CI/CD"]
        CLOUDFLARE["Cloudflare Pages"]
        NETLIFY["Netlify"]
        RENDER["Render"]
    end

    subgraph "桌面版"
        WIN["Windows<br/>Portable .exe"]
        MAC["macOS<br/>.dmg"]
        LINUX["Linux<br/>AppImage"]
    end

    subgraph "外部服务"
        GEMINI_API["Gemini API"]
        OPENAI_API["OpenAI Whisper API"]
    end

    VERCEL --> GEMINI_API
    VERCEL --> OPENAI_API
    WIN --> GEMINI_API
    WIN --> OPENAI_API
    WIN --> LOCAL["本地 Whisper<br/>(whisper.cpp)"]
```

---

## 📝 开发指南

### 环境要求

- Node.js 18+
- npm 或 yarn

### 快速开始

```bash
# 安装依赖
yarn install

# Web 开发模式
yarn dev

# Electron 开发模式
yarn electron:dev

# 构建 Electron 应用
yarn electron:build
```

### 环境变量

```env
GEMINI_API_KEY=your_gemini_key    # 必需：翻译和校对
OPENAI_API_KEY=your_openai_key    # 可选：在线 Whisper
```

---

## 📚 参考资料

- [Google Gemini API 文档](https://ai.google.dev/docs)
- [OpenAI Whisper API](https://platform.openai.com/docs/guides/speech-to-text)
- [whisper.cpp 项目](https://github.com/ggerganov/whisper.cpp)
- [Silero VAD](https://github.com/snakers4/silero-vad)
