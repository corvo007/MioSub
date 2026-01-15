# Gemini Subtitle Pro - Project Architecture Document

[中文文档 (Chinese Documentation)](./ARCHITECTURE_zh.md)

## 📖 Project Overview

**Gemini Subtitle Pro** is an AI-powered subtitle creation, translation, and polishing tool. Built with React + Vite + Electron tech stack, supporting both Web and Desktop client deployment.

- **Tech Stack**: React 19, Vite 6, Electron 39, TypeScript
- **AI Engines**: Google Gemini (Translation/Polishing), OpenAI Whisper (Speech Recognition)

---

## 🏗️ Technology Stack Architecture

### Technology Stack Layered Diagram

```mermaid
flowchart TB
    subgraph PRESENTATION["📱 Presentation Layer"]
        direction TB
        REACT["React 19.2<br/>UI Framework"]
        TAILWIND["TailwindCSS 4.1<br/>Styling System"]
        LUCIDE["Lucide React<br/>Icon Library"]
        UI_LIB["Unified UI Components<br/>(Button, Modal, Input)"]
        ASSJS["assjs<br/>WYSIWYG Subtitle Rendering"]
        VIDEO_PLAYER["VideoPlayerPreview<br/>Progressive Video Playback"]
    end

    subgraph BUILD["🔧 Build Toolchain"]
        direction TB
        VITE["Vite 6.2<br/>Dev Server & Bundler"]
        TS["TypeScript 5.8<br/>Type System"]
        POSTCSS["PostCSS<br/>CSS Post-processing"]
    end

    subgraph RUNTIME["⚡ Runtime Layer"]
        direction TB

        subgraph WEB["Web Runtime"]
            WEB_AUDIO["Web Audio API<br/>Audio Decoding"]
            WEB_WORKER["Web Workers<br/>Background Processing"]
            ONNX["ONNX Runtime Web<br/>VAD Model Inference"]
        end

        subgraph ELECTRON_RT["Electron Runtime"]
            ELECTRON["Electron 39<br/>Desktop Container"]
            NODE["Node.js<br/>Local API"]
            IPC["IPC<br/>Process Communication"]
            LOCAL_VIDEO["local-video:// Protocol<br/>Streaming Media Access"]
        end
    end

    subgraph AI["🤖 AI Services Layer"]
        direction TB

        subgraph GOOGLE["Google AI"]
            GEMINI_SDK["@google/genai<br/>Gemini SDK"]
            FLASH["Gemini 2.5/3 Flash<br/>Translation/Proofreading"]
            PRO["Gemini 3 Pro<br/>Glossary/Speaker/Proofreading"]
        end

        subgraph OPENAI_SVC["OpenAI"]
            OPENAI_SDK["openai 6.9<br/>OpenAI SDK"]
            WHISPER_API["Whisper API<br/>Cloud Transcription"]
        end

        subgraph LOCAL_AI["Local AI"]
            VAD["Silero VAD<br/>(ONNX)"]
            WHISPER_CPP["whisper.cpp<br/>Local Transcription"]
        end
    end

    subgraph NATIVE["🖥️ Native Layer"]
        direction TB
        FFMPEG_BIN["FFmpeg<br/>Audio/Video Processing"]
        YT_DLP["yt-dlp<br/>Video Download"]
        CUDA["CUDA (Optional)<br/>GPU Acceleration"]
    end

    PRESENTATION --> BUILD
    BUILD --> RUNTIME
    RUNTIME --> AI
    ELECTRON_RT --> NATIVE
```

### Dependency Version Overview

| Category             | Dependency         | Version | Purpose                    |
| :------------------- | :----------------- | :------ | :------------------------- |
| **Core Frameworks**  | React              | 19.2    | UI Framework               |
|                      | Vite               | 6.2     | Build Tool                 |
|                      | TypeScript         | 5.8     | Type System                |
|                      | Electron           | 39      | Desktop Container          |
| **AI SDK**           | @google/genai      | Latest  | Gemini API                 |
|                      | openai             | Latest  | Whisper API                |
|                      | onnxruntime-web    | 1.23    | VAD Inference              |
| **Audio Processing** | @ricky0123/vad-web | 0.0.30  | Silero VAD Wrapper         |
|                      | fluent-ffmpeg      | 2.1     | FFmpeg Control             |
| **i18n**             | i18next            | 25.7    | Internationalization Core  |
|                      | react-i18next      | 16.5    | React Bindings             |
| **Rendering**        | assjs              | 0.1.4   | WYSIWYG Subtitle Rendering |
| **Styling**          | TailwindCSS        | 4.1     | Atomic CSS                 |
|                      | Lucide React       | 0.554   | Icon Library               |
| **Utils**            | clsx / tw-merge    | Latest  | Style Merging              |

---

## 📏 Code Standards & Engineering

### Path Aliases

This project uses path aliases comprehensively under `src` and `electron` directories. **Relative paths are prohibited** (like `../../`) for cross-level module references, except for same-level file references (using aliases uniformly is recommended).

- `@/*` -> `src/*` (Core Source Code)
- `@components/*` -> `src/components/*`
- `@hooks/*` -> `src/hooks/*`
- `@services/*` -> `src/services/*`
- `@utils/*` -> `src/utils/*`
- `@types/*` -> `src/types/*`
- `@lib/*` -> `src/lib/*` (New)
- `@electron/*` -> `electron/*` (Electron Main Process Code)

### Directory Organization Principles

- **Co-location Principle**: Utility functions or components used only within a specific module should be placed in that module's `utils` or `shared` subdirectory, rather than elevated to global.
  - For example, `src/components/endToEnd/wizard/utils/validation.ts` serves only the wizard module.
- **Separation of Concerns**:
  - `src/utils`: Global common, pure JavaScript/UI helper functions.
  - `src/services/utils`: Infrastructure, logging, system-level tools.

---

## 🧱 Application Module Architecture

```mermaid
flowchart TB
    subgraph APP_LAYER["App Layer"]
        direction LR
        APP["App.tsx<br/>Routing & State Container"]

        subgraph PAGES["Pages"]
            HOME["HomePage<br/>Upload Entry"]
            WORKSPACE["WorkspacePage<br/>Editing Workspace"]
            GLOSSARY_PAGE["GlossaryManager<br/>Glossary Management"]
            DOWNLOAD_PAGE["DownloadPage<br/>Video Download"]
            COMPRESS_PAGE["CompressionPage<br/>Video Encoding"]
            E2E_WIZARD["EndToEndWizard<br/>Full Auto Processing"]
        end

        APP --> PAGES
    end

    subgraph HOOKS_LAYER["State Layer (Hooks)"]
        direction LR

        subgraph CORE_HOOKS["Core Hooks"]
            USE_WORKSPACE["useWorkspaceLogic<br/>Workspace Logic Entry"]
            USE_AUTO_SAVE["useAutoSave"]
            USE_FILE_OPS["useFileOperations"]
            USE_GENERATION["useGeneration"]
            USE_BATCH["useBatchActions"]
            USE_SETTINGS["useSettings<br/>Settings Persistence"]
        end

        subgraph FEATURE_HOOKS["Feature Hooks"]
            USE_GLOSSARY["useGlossaryFlow<br/>Glossary Flow"]
            USE_SNAPSHOTS["useSnapshots<br/>Version Snapshots"]
            USE_DOWNLOAD["useDownload<br/>Download Logic"]
            USE_TOAST["useToast<br/>Notification System"]
            USE_E2E["useEndToEnd<br/>Pipeline State"]
            USE_VIDEO_PREVIEW["useVideoPreview<br/>Video Playback & Transcoding"]
        end
    end

    subgraph SERVICES_LAYER["Services Layer"]
        direction TB

        subgraph API_SVC["API Services"]
            direction LR
            GEMINI_CORE["gemini/core/<br/>client.ts (Client & Config)"]
            OPENAI_SVC2["openai/<br/>transcribe.ts"]
            WHISPER_SVC["whisper-local/<br/>transcribe.ts"]
        end

        subgraph GENERATION_SVC["Generation Services"]
            direction TB
            PIPELINE["pipeline/<br/>index.ts (Orchestrator)<br/>pipelineCore.ts<br/>steps/*.ts"]
            EXTRACTORS["extractors/<br/>glossary.ts<br/>speakerProfile.ts"]
            BATCH_OPS["batch/<br/>proofread.ts<br/>regenerate.ts"]
        end

        subgraph AUDIO_SVC["Audio Services"]
            direction LR
            SEGMENTER_SVC["segmenter.ts (17KB)<br/>SmartSegmenter"]
            SAMPLER_SVC["sampler.ts (12KB)<br/>Intelligent Sampling"]
            DECODER_SVC["decoder.ts<br/>Audio Decoding"]
        end

        subgraph SUBTITLE_SVC["Subtitle Services"]
            direction LR
            PARSER_SVC["parser.ts (13KB)<br/>Multi-format Parsing"]
            GENERATOR_SVC["generator.ts<br/>Format Export"]
            TIME_SVC["time.ts<br/>Timecode Processing"]
            RECONCILER_SVC["reconciler.ts<br/>Robust Reconciliation"]
        end

        subgraph ALIGNMENT_SVC["Alignment Services"]
            direction LR
            AL_STRATEGY["utils/strategies/ctcAligner.ts<br/>CTC Timestamping"]
            AL_IDX["utils/index.ts<br/>Factory"]
        end

        subgraph GLOSSARY_SVC["Glossary Services"]
            direction LR
            MANAGER_SVC["manager.ts<br/>Glossary Management"]
            MERGER_SVC["merger.ts<br/>Glossary Merging"]
            SELECTOR_SVC["selector.ts<br/>Segment Selection"]
        end

        subgraph DOWNLOAD_SVC["Download Services"]
            direction LR
            DL_SVC["download.ts<br/>Download Logic"]
            DL_TYPES["types.ts<br/>Download Types"]
        end
    end

    subgraph INFRA_LAYER["Infrastructure Layer"]
        direction LR

        subgraph UTILS["Utils"]
            CONCURRENCY["concurrency.ts<br/>Semaphore"]
            LOGGER["logger.ts<br/>Logging System"]
            ENV["env.ts<br/>Environment Variables"]
            SNAPSHOT["snapshotStorage.ts<br/>Snapshot Persistence"]
        end

        subgraph WORKERS_GROUP["Workers"]
            VAD_WORKER["vad.worker.ts<br/>VAD Background"]
            PARSER_WORKER["parser.worker.ts<br/>Parser Background"]
        end

        subgraph TYPES_GROUP["Types (Src/types)"]
            SUBTITLE_TYPE["src/types/subtitle.ts"]
            SETTINGS_TYPE["src/types/settings.ts"]
            API_TYPE["src/types/api.ts"]
            GLOSSARY_TYPE["src/types/glossary.ts"]
            PIPELINE_TYPE["src/types/pipeline.ts"]
        end
    end

    subgraph ELECTRON_LAYER["Electron Layer (Desktop Only)"]
        direction LR
        MAIN_PROCESS["main.ts (15KB)<br/>Main Process"]
        PRELOAD_SCRIPT["preload.ts<br/>Security Bridge"]

        subgraph ELECTRON_SVC["Desktop Services"]
            LOCAL_WHISPER_SVC["localWhisper.ts (13KB)<br/>GPU Detection"]
            FFMPEG_SVC["ffmpegAudioExtractor.ts"]
            COMPRESSOR_SVC["videoCompressor.ts<br/>HW Acceleration"]
            YTDLP_SVC["ytdlp.ts"]
            PIPELINE_SVC["endToEndPipeline.ts<br/>Full Auto Pipeline"]
            PREVIEW_SVC["videoPreviewTranscoder.ts<br/>Video Preview & Caching"]
            STORAGE_SVC["storage.ts<br/>Portable Storage"]
            LOGGER_SVC["logger.ts<br/>JSON View"]
            PATHS_UTIL["utils/paths.ts<br/>Path Resolution"]
        end

        MAIN_PROCESS --> ELECTRON_SVC
        PIPELINE_SVC -.-> YTDLP_SVC
        PIPELINE_SVC -.-> COMPRESSOR_SVC
        ELECTRON_SVC -.-> PREVIEW_SVC
    end

    APP_LAYER --> HOOKS_LAYER
    HOOKS_LAYER --> SERVICES_LAYER
    SERVICES_LAYER --> INFRA_LAYER
    SERVICES_LAYER -.-|"Electron Only"| ELECTRON_LAYER
```

### Module Dependency Graph

```mermaid
flowchart LR
    subgraph ENTRY["Entry"]
        PIPELINE_IDX["generation/pipeline/index.ts<br/>generateSubtitles()"]
    end

    subgraph EXTRACTORS_DEPS["Extractors"]
        GLOSSARY_EXT["extractors/glossary.ts"]
        SPEAKER_EXT["extractors/speakerProfile.ts"]
    end

    subgraph CORE_DEPS["Core Dependencies"]
        BATCH_OPS["generation/batch/<br/>proofread.ts, regenerate.ts"]
        GEMINI_CLIENT["api/gemini/core/client.ts"]
        PROMPTS_TS["api/gemini/core/prompts.ts"]
        SCHEMAS_TS["api/gemini/core/schemas.ts"]
    end

    subgraph AUDIO_DEPS["Audio Dependencies"]
        SEGMENTER_TS["segmenter.ts<br/>SmartSegmenter"]
        SAMPLER_TS["sampler.ts<br/>intelligentSampling()"]
        DECODER_TS["decoder.ts"]
        PROCESSOR_TS["processor.ts<br/>sliceAudioBuffer()"]
    end

    subgraph TRANSCRIBE_DEPS["Transcription Dependencies"]
        OPENAI_TRANSCRIBE["openai/transcribe.ts"]
        LOCAL_TRANSCRIBE["whisper-local/transcribe.ts"]
    end

    subgraph UTIL_DEPS["Utility Dependencies"]
        CONCURRENCY_TS["concurrency.ts<br/>Semaphore, mapInParallel"]
        LOGGER_TS["logger.ts"]
        PRICING_TS["pricing.ts"]
    end

    subgraph DOWNLOAD_DEPS["Download Dependencies"]
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

## 📁 Directory Structure

```
Gemini-Subtitle-Pro/
├── 📂 src/                          # Frontend Source Code
│   ├── 📄 App.tsx                   # Application Main Entry
│   ├── 📄 index.tsx                 # React Render Entry
│   ├── 📄 index.css                 # Global Styles
│   ├── 📄 i18n.ts                   # [NEW] i18n Configuration Entry
│   │
│   ├── 📂 components/               # UI Components
│   │   ├── 📂 common/               # Common Business Components (Header, PageHeader, etc.)
│   │   ├── 📂 editor/               # Subtitle Editor & Video Preview Components
│   │   │   ├── 📄 VideoPlayerPreview.tsx  # [NEW] Progressive Video Player with ASS Rendering
│   │   │   ├── 📄 RegenerateModal.tsx     # [NEW] Batch Regenerate Modal
│   │   │   └── 📄 ...               # SubtitleRow, Batch, etc.
│   │   ├── 📂 compression/          # [NEW] Video Compression Page Components
│   │   │   ├── 📄 EncoderSelector.tsx # Encoder Selection & Config
│   │   │   └── 📄 ...
│   │   ├── 📂 pages/                # Page-level Components (HomePage, WorkspacePage, etc.)
│   │   ├── 📂 ui/                   # Base UI Component Library (Modal, Toggle, TextInput...)
│   │   ├── 📂 settings/             # Settings-related Components
│   │   │   ├── 📂 tabs/             # [NEW] Modular Settings Panels (GeneralTab, AboutTab, etc.)
│   │   │   └── 📄 SettingsModal.tsx # Settings Modal Container
│   │   ├── 📂 layout/               # Layout Containers
│   │   ├── 📂 modals/               # Business Modals (GlossaryConfirmationModal, SpeakerManagerModal, etc.)
│   │   ├── 📂 endToEnd/             # End-to-End Wizard Components
│   │   └── 📂 ...                   # Other feature-divided component directories
│   │
│   ├── 📂 hooks/                    # React Hooks
│   │   ├── 📂 useWorkspaceLogic/    # Core Workspace Logic
│   │   ├── 📄 useVideoPreview.ts    # [NEW] Video Preview & Transcoding State
│   │   └── ...                      # Other Feature Hooks
│   │
│   ├── 📂 locales/                  # [NEW] Internationalization Resources
│   │   ├── 📂 zh-CN/                # Chinese (Simplified)
│   │   ├── 📂 en-US/                # English
│   │   └── 📂 ja-JP/                # Japanese (New in v2.13)
│   │
│   ├── 📂 services/                 # Service Layer (Pure Logic)
│   │   ├── 📂 api/                  # API Integration
│   │   ├── 📂 generation/           # Generation Services (Core Business Logic)
│   │   │   ├── 📂 pipeline/         # Complete Pipeline
│   │   │   │   ├── 📂 core/         # [NEW] Base step class and type definitions
│   │   │   │   └── 📂 steps/        # [NEW] Step implementations (Transcription, Refinement, Alignment, Translation, Proofread)
│   │   │   ├── 📂 extractors/       # Information Extraction
│   │   │   └── 📂 batch/            # Batch Operations (proofread.ts, regenerate.ts)
│   │   ├── 📂 audio/                # Audio Processing
│   │   ├── 📂 subtitle/             # Subtitle Parsing and Generation
│   │   │   ├── 📄 reconciler.ts     # [NEW] Data Reconciler (Data Hub)
│   │   │   └── 📄 ...
│   │   ├── 📂 alignment/            # [NEW] Alignment Services
│   │   │   ├── 📂 strategies/       # Alignment Strategies (CTC)
│   │   │   └── 📄 index.ts          # Strategy Factory
│   │   ├── 📂 download/             # Download Service Logic
│   │   └── 📂 utils/                # Common Service Tools
│   │
│   ├── 📂 config/                   # Configuration Module
│   │   ├── 📄 index.ts              # Config Export Entry
│   │   └── 📄 models.ts             # Model Config
│   │
│   ├── 📂 lib/                      # Common Libraries
│   │
│   ├── 📂 types/                    # [NEW] Centralized Type Definitions
│   │   ├── 📄 pipeline.ts           # Pipeline Shared Types
│   │   ├── 📄 alignment.ts          # Alignment Types
│   │   └── 📄 ...
│   │
│   └── 📂 workers/                  # Web Workers
│
├── 📂 electron/                     # Electron Desktop Code
│   ├── 📄 main.ts                   # Main Process Entry
│   ├── 📄 preload.ts                # Preload Script
│   ├── 📄 logger.ts                 # Unified Logging Service (with JSON View)
│   ├── 📂 utils/                    # [NEW] Utility Modules
│   │   └── 📄 paths.ts              # Portable path resolution
│   └── 📂 services/                 # Desktop Services (Node.js Env)
│       ├── 📄 localWhisper.ts       # Local Whisper Call (with GPU Detection)
│       ├── 📄 videoPreviewTranscoder.ts # Video Preview & Caching
│       ├── 📄 storage.ts            # Portable storage service
│       └── ...                      # Other System-level Services
│
└── 📄 package.json                  # Project Config
```

---

## 🔄 Core Process Diagrams

### 1. Complete Pipeline Concurrent Architecture

The diagram below shows the complete concurrent architecture for subtitle generation, including parallel async tasks, Semaphore control, and cross-task dependencies:

```mermaid
flowchart TB
    subgraph INIT["🎬 Initialization Phase"]
        A[Audio/Video File] --> B[Audio Decoding]
        B --> C{Smart Segmentation?}
        C -->|Yes| D["VAD Smart Split<br/>(Silero VAD)"]
        C -->|No| E[Fixed Duration Split]
        D --> F[Audio Chunk List]
        E --> F
        D --> G["Cache VAD Segments<br/>(For Speaker Sampling Reuse)"]
    end

    subgraph PARALLEL["⚡ Parallel Async Tasks (Promise)"]
        direction TB

        subgraph GLOSSARY["📚 Glossary Extraction Pipeline"]
            H["glossaryPromise<br/>(Gemini 3 Pro)"]
            H --> I[Select Sampling Segments]
            I --> J["Concurrent Term Extraction<br/>(concurrencyPro=2)"]
            J --> K[Search Grounding Validation]
            K --> L["⏸️ Wait for User Confirmation<br/>(BLOCKING)"]
            L --> M["GlossaryState<br/>(Non-blocking Wrapper)"]
        end

        subgraph SPEAKER["🗣️ Speaker Recognition Pipeline"]
            N["speakerProfilePromise<br/>(Gemini 3 Pro)"]
            N --> O["Intelligent Audio Sampling<br/>(Reuses VAD Segments)"]
            O --> P[Extract Speaker Profiles]
            P --> Q["SpeakerProfile[]<br/>{name, style, tone, catchphrases}"]
        end
    end

    subgraph CHUNKS["🔄 Chunk Parallel Processing (mapInParallel)"]
        direction TB

        subgraph CHUNK1["Chunk 1"]
            C1_T["Transcription<br/>⏳ Wait for transcriptionSemaphore"]
            C1_T --> C1_G["⏳ await glossaryState.get()"]
            C1_G --> C1_S["⏳ await speakerProfiles"]
            C1_S --> C1_R["Refinement<br/>⏳ Wait for refinementSemaphore"]
            C1_R --> C1_TR[Translation]
        end

        subgraph CHUNK2["Chunk 2"]
            C2_T["Transcription<br/>⏳ Wait for transcriptionSemaphore"]
            C2_T --> C2_G["⏳ await glossaryState.get()"]
            C2_G --> C2_S["⏳ await speakerProfiles"]
            C2_S --> C2_R["Refinement<br/>⏳ Wait for refinementSemaphore"]
            C2_R --> C2_TR[Translation]
        end

        subgraph CHUNKN["Chunk N..."]
            CN_T["Transcription"]
            CN_T --> CN_G["Wait for Glossary"]
            CN_G --> CN_S["Wait for Speakers"]
            CN_S --> CN_R["Refinement"]
            CN_R --> CN_TR[Translation]
        end
    end

    F --> PARALLEL
    G --> O
    F --> CHUNKS
    M -.-|"Non-blocking Access"| C1_G
    M -.-|"Non-blocking Access"| C2_G
    Q -.-|"Wait for Completion"| C1_S
    Q -.-|"Wait for Completion"| C2_S

    subgraph MERGE["📦 Merge Results"]
        R[Merge All Chunk Results]
        R --> S[Renumber Subtitle IDs]
        S --> T[Token Usage Report]
    end

    CHUNKS --> MERGE
```

---

### 2. Dual Semaphore Concurrency Control Details

```mermaid
flowchart LR
    subgraph SEMAPHORES["🔒 Semaphore Resource Pool"]
        subgraph TRANS["transcriptionSemaphore"]
            T1["Slot 1"]
            T2["Slot 2<br/>(Local Whisper Default 1)"]
        end

        subgraph ALIGN["alignmentSemaphore"]
            A1["Slot 1"]
            A2["Slot 2"]
            A3["Slot 3"]
        end

        subgraph REFINE["refinementSemaphore"]
            R1["Slot 1"]
            R2["Slot 2"]
            R3["Slot 3"]
            R4["Slot 4"]
            R5["Slot 5<br/>(Flash Default 5)"]
        end
    end

    subgraph CHUNKS["Chunks Queuing"]
        C1["Chunk 1"]
        C2["Chunk 2"]
        C3["Chunk 3"]
        C4["Chunk 4"]
        C5["Chunk 5"]
        C6["Chunk 6"]
    end

    C1 -->|"acquire()"| T1
    C2 -->|"acquire()"| T2
    C3 -->|"waiting..."| TRANS

    C1 -->|"After Transcription"| R1
    C2 -->|"After Transcription"| R2

    C1 -->|"After Refinement"| A1
    C2 -->|"After Refinement"| A2
```

**Configuration Explanation:**

| Semaphore                      | Purpose                    | Default Concurrency | Config Item            |
| :----------------------------- | :------------------------- | :------------------ | :--------------------- |
| `transcriptionSemaphore`       | Controls Whisper API Calls | Local: 1, Cloud: 5  | `whisperConcurrency`   |
| `refinementSemaphore`          | Controls Gemini Flash API  | 5                   | `concurrencyFlash`     |
| `alignmentSemaphore`           | Controls Alignment Tools   | 2                   | `concurrencyAlignment` |
| (Glossary Extraction Internal) | Controls Gemini Pro API    | 2                   | `concurrencyPro`       |

---

### 3. Chunk Internal 5-Stage Pipeline

```mermaid
sequenceDiagram
    participant Chunk as Chunk N
    participant TSem as transcriptionSemaphore
    participant Whisper as Whisper API
    participant GState as GlossaryState
    participant SProm as speakerProfilePromise
    participant RSem as refinementSemaphore
    participant Gemini as Gemini Flash
    participant ASem as alignmentSemaphore
    participant Aligner as CTC Aligner

    Note over Chunk: Stage 1: Transcription
    Chunk->>TSem: acquire()
    activate TSem
    TSem-->>Chunk: Permission Granted
    Chunk->>Whisper: transcribe(audioChunk)
    Whisper-->>Chunk: rawSegments[]
    Chunk->>TSem: release()
    deactivate TSem

    Note over Chunk: Stage 2: Wait for Glossary (Non-blocking)
    Chunk->>GState: await get()
    GState-->>Chunk: finalGlossary[]

    Note over Chunk: Stage 3: Wait for Speaker Profiles
    Chunk->>SProm: await speakerProfiles
    SProm-->>Chunk: SpeakerProfile[]

    Note over Chunk: Stage 4: Refinement
    Chunk->>RSem: acquire()
    activate RSem
    RSem-->>Chunk: Permission Granted
    Chunk->>Gemini: Refinement (Audio+Text)
    Note right of Gemini: Timeline Correction<br/>Apply Glossary<br/>Speaker Matching
    Gemini-->>Chunk: refinedSegments[]
    Chunk->>RSem: release()
    deactivate RSem

    Note over Chunk: Stage 5: Alignment
    Chunk->>ASem: acquire()
    activate ASem
    ASem-->>Chunk: Permission Granted
    Chunk->>Aligner: align(refinedSegments)
    Note right of Aligner: Precise Timestamp<br/>Alignment w/ Audio
    Aligner-->>Chunk: alignedSegments[]
    Chunk->>ASem: release()
    deactivate ASem

    Note over Chunk: Stage 6: Translation
    Chunk->>RSem: acquire()
    activate RSem
    RSem-->>Chunk: Permission Granted
    Chunk->>Gemini: Translation (Batch)
    Gemini-->>Chunk: translatedItems[]
    Chunk->>RSem: release()
    deactivate RSem

    Note over Chunk: Complete
```

---

### 3.5 Pipeline Step Architecture (New in v2.13)

v2.13 introduces a class-based step architecture, modularizing Chunk processing logic:

```mermaid
classDiagram
    class BaseStep~TInput, TOutput~ {
        <<abstract>>
        #context: StepContext
        #pipelineContext: PipelineContext
        +execute(input: TInput) StepResult~TOutput~
        #run(input: TInput)* TOutput
        #shouldSkip(input: TInput) boolean
        #getMockOutput(input: TInput) TOutput
    }

    class TranscriptionStep {
        +run(input) SubtitleItem[]
        -transcribeWithWhisper()
    }

    class WaitForDepsStep {
        +run(input) WaitForDepsOutput
        -awaitGlossary()
        -awaitSpeakers()
    }

    class RefinementStep {
        +run(input) SubtitleItem[]
        -refineWithGemini()
    }

    class AlignmentStep {
        +run(input) SubtitleItem[]
        -alignWithCTC()
    }

    class TranslationStep {
        +run(input) SubtitleItem[]
        -translateWithGemini()
    }

    class ProofreadStep {
        +run(input) SubtitleItem[]
        -proofreadWithGemini()
    }

    BaseStep <|-- TranscriptionStep
    BaseStep <|-- WaitForDepsStep
    BaseStep <|-- RefinementStep
    BaseStep <|-- AlignmentStep
    BaseStep <|-- TranslationStep
    BaseStep <|-- ProofreadStep
```

**Step Descriptions:**

| Step                | File                   | Input            | Output              | Purpose                                  |
| :------------------ | :--------------------- | :--------------- | :------------------ | :--------------------------------------- |
| `TranscriptionStep` | `TranscriptionStep.ts` | AudioChunk       | `SubtitleItem[]`    | Whisper speech-to-text                   |
| `WaitForDepsStep`   | `WaitForDepsStep.ts`   | -                | Glossary + Speakers | Wait for glossary and speaker extraction |
| `RefinementStep`    | `RefinementStep.ts`    | `SubtitleItem[]` | `SubtitleItem[]`    | Timeline correction, apply glossary      |
| `AlignmentStep`     | `AlignmentStep.ts`     | `SubtitleItem[]` | `SubtitleItem[]`    | CTC forced alignment                     |
| `TranslationStep`   | `TranslationStep.ts`   | `SubtitleItem[]` | `SubtitleItem[]`    | AI translation                           |
| `ProofreadStep`     | `ProofreadStep.ts`     | `SubtitleItem[]` | `SubtitleItem[]`    | Batch proofreading (optional)            |

---

### 3.6 Batch Operations Comparison (New in v2.13)

v2.13 splits batch operations into two independent modes:

| Feature        | Proofread                                  | Regenerate                                                         |
| :------------- | :----------------------------------------- | :----------------------------------------------------------------- |
| **File**       | `batch/proofread.ts`                       | `batch/regenerate.ts`                                              |
| **Purpose**    | Polish and proofread existing translations | Completely reprocess selected segments                             |
| **Pipeline**   | Gemini Pro proofreading only               | Transcribe → Refine → Align → Translate (full pipeline)            |
| **Input**      | Existing `SubtitleItem[]`                  | Raw audio + time range                                             |
| **Preserved**  | Original timeline preserved                | Everything regenerated                                             |
| **Use Cases**  | Improve translation quality, fix typos     | Fix transcription errors, re-segment, re-run after glossary update |
| **User Hints** | Not supported                              | Supports transcription and translation hints                       |
| **Model**      | Gemini 3 Pro                               | Whisper + Gemini Flash                                             |

```mermaid
flowchart LR
    subgraph PROOFREAD["Proofread Mode"]
        P_IN["Selected Segments"] --> P_GEMINI["Gemini Pro<br/>Proofreading"]
        P_GEMINI --> P_OUT["Proofread Segments"]
    end

    subgraph REGENERATE["Regenerate Mode"]
        R_IN["Selected Segments<br/>+ Time Range"] --> R_AUDIO["Extract Audio"]
        R_AUDIO --> R_TRANS["Whisper Transcribe"]
        R_TRANS --> R_REFINE["Refinement"]
        R_REFINE --> R_ALIGN["CTC Alignment"]
        R_ALIGN --> R_TRANSLATE["Translation"]
        R_TRANSLATE --> R_OUT["Regenerated Segments"]
    end
```

---

### 4. Data Integrity & Reconciliation (The "Data Hub")

The system employs a rigorous **Data Reconciliation Strategy** (`src/services/subtitle/reconciler.ts`) to ensure metadata persistence across the pipeline matches (Refinement, Alignment, Translation), even when the number of segments changes due to splitting or merging.

#### 4.1 The Reconciler Logic

The `reconcile(prev, curr)` function acts as the "Data Hub" connecting pipeline stages. It intelligently merges `prev` (source) metadata into `curr` (newly generated) segments:

- **Semantic Metadata** (Always Inherited):
  - `speaker` (Speaker ID/Name)
  - `comment` (User comments)
  - **Logic**: Inherited from the `prev` segment with the highest overlap ratio. Even if segments are split, they all inherit the parent's speaker.
- **Internal State** (Conditionally Inherited):
  - `alignmentScore` (CTC Confidence)
  - `lowConfidence` (Flag)
  - `hasRegressionIssue`, `hasCorruptedRangeIssue` (Error Flags)
  - **Logic**: Strictly inherited **ONLY** when a **1:1 mapping** is detected. If a segment is split or merged, these internal flags are resetting to avoid false propagation (e.g., a "Perfect Alignment" score shouldn't automatically apply to two new half-segments without re-verification).

#### 4.2 Alignment Strategy (CTC)

The system uses **CTC (Connectionist Temporal Classification)** for high-precision alignment:

- **Engine**: `ctcAligner.ts` interfacing with an external `align.exe` (MMS-300m model).
- **Function**: Updates `startTime` and `endTime` based on effective audio alignment, but **never splits or merges** segments.
- **Metadata**: Adds `alignmentScore` to segments. Scores below threshold trigger `lowConfidence` flag for user review.

---

### 5. Glossary Extraction and User Interaction Flow

```mermaid
sequenceDiagram
    participant Pipeline as generateSubtitles
    participant Glossary as extractGlossaryFromAudio
    participant Pro as Gemini 3 Pro
    participant State as GlossaryState
    participant UI as User Interface
    participant Chunks as Chunk Workers

    Note over Pipeline: Start Parallel Glossary Extraction
    Pipeline->>+Glossary: glossaryPromise = extract()
    Pipeline->>State: new GlossaryState(promise)
    Note over State: Wrap Promise as Non-blocking Accessor

    par Glossary Extraction Proceeds in Parallel
        loop Sampling Segment Concurrent Processing (concurrencyPro=2)
            Glossary->>Pro: Send Audio Segment
            Pro->>Pro: Search Grounding Validation
            Pro-->>Glossary: GlossaryExtractionResult
        end
    and Chunks Can Start Transcription
        Chunks->>Chunks: Start Transcription Stage
        Chunks->>State: await get()
        Note over State: Chunks Wait for Glossary Here
    end

    Glossary-->>-Pipeline: extractedResults[]

    Note over Pipeline: Wait for User Confirmation (BLOCKING)
    Pipeline->>UI: onGlossaryReady(metadata)
    UI->>UI: Display Glossary Modal
    UI-->>Pipeline: confirmedGlossary[]

    Pipeline->>State: resolve(confirmedGlossary)
    Note over State: All Waiting Chunks Are Awakened

    State-->>Chunks: finalGlossary[]
    Note over Chunks: Continue to Refinement Stage
```

---

### 6. Speaker Recognition Position in Pipeline

```mermaid
flowchart TB
    subgraph PARALLEL["Parallel Started Promises"]
        GP["glossaryPromise<br/>Glossary Extraction"]
        SP["speakerProfilePromise<br/>Speaker Recognition"]
    end

    subgraph CHUNK["Each Chunk's Processing Flow"]
        T["Transcription<br/>(Independent)"]
        WG["Wait for glossaryState.get()"]
        WS["Wait for speakerProfiles"]
        R["Refinement<br/>(Merge Glossary+Speakers)"]
        TR["Translation"]

        T --> WG
        WG --> WS
        WS --> R
        R --> TR
    end

    GP -.-|"After User Confirms"| WG
    SP -.-|"After Extraction Complete"| WS

    subgraph REFINEMENT["Refinement Stage Uses"]
        G["Glossary → Correct Recognition Errors"]
        S["Speaker Profiles → Match Speakers"]
        G --> PROMPT["System Prompt"]
        S --> PROMPT
    end

    R --> REFINEMENT
```

**Pipeline Dependency Summary:**

| Stage         | Dependencies                                | Description                                     |
| :------------ | :------------------------------------------ | :---------------------------------------------- |
| Transcription | `transcriptionSemaphore`                    | Independent Execution, No Blocking Dependencies |
| Wait Glossary | `glossaryState.get()`                       | Must Wait for Glossary Confirmation Complete    |
| Wait Speakers | `speakerProfilePromise`                     | Must Wait for Speaker Recognition Complete      |
| Refinement    | `refinementSemaphore` + Glossary + Speakers | Merge and Use All Data                          |
| Alignment     | `alignmentSemaphore`                        | High-precision Timestamp Alignment              |
| Translation   | `refinementSemaphore` (Shared)              | Translated after Alignment                      |

---

### 7. Desktop Full Workflow (Download-Create-Encode)

Desktop-exclusive complete workflow, connecting from material acquisition to final output:

```mermaid
flowchart LR
    subgraph DOWNLOAD["📥 Resource Acquisition"]
        direction TB
        YTB["YouTube<br/>(yt-dlp)"]
        BILI["Bilibili<br/>(yt-dlp)"]
        LOCAL_FILE["Local Video File"]

        YTB --> DOWNLOADER["Video Downloader"]
        BILI --> DOWNLOADER
        DOWNLOADER --> LOCAL_FILE
    end

    subgraph PROCESS["⚙️ Subtitle Creation"]
        direction TB
        LOCAL_FILE --> IMPORT["Import/Decode"]
        IMPORT --> GEN["AI Subtitle Generation<br/>(Whisper + Gemini)"]
        GEN --> EDIT["Workspace Edit/Proofread"]
        LOCAL_FILE -.-> PREVIEW["Video Preview<br/>(WYSIWYG Playback)"]
        EDIT <-.-> PREVIEW

        EDIT --> SRT_ASS["Export Subtitle File<br/>(.srt / .ass)"]
    end

    subgraph COMPRESS["🎬 Final Encoding"]
        direction TB
        LOCAL_FILE --> COMPRESSOR["Video Encoding Engine<br/>(FFmpeg + HW Accel)"]
        EDIT -.-|"Auto Pass Subtitle Path"| COMPRESSOR
        SRT_ASS -.-|"Manually Select Subtitle"| COMPRESSOR

        COMPRESSOR --> OUTPUT["Hardsubbed Video<br/>(Hardsub Video)"]
    end

    DOWNLOAD --> PROCESS
    PROCESS --> COMPRESS
```

---

### 8. Full Auto End-to-End Mode (End-to-End Pipeline)

This is an Electron-exclusive core feature that coordinates Main Process (resource scheduling) and Renderer Process (AI computation) through IPC communication, achieving "one-click cooked content".

#### 8.1 Cross-Process Interaction Architecture

```mermaid
sequenceDiagram
    participant User as User Input
    participant Main as 🖥️ Main Process (Node.js)
    participant Renderer as 🎨 Renderer Process (Web)
    participant Ext as 🛠️ External Tools (yt-dlp/ffmpeg)
    participant AI as ☁️ AI Services (Gemini/OpenAI)

    User->>Main: 1. Submit Video URL
    activate Main

    note over Main: [Phase 1: Resource Preparation]
    Main->>Ext: Call yt-dlp Download
    Ext-->>Main: Original Video (.mp4)
    Main->>Ext: Call ffmpeg Extract Audio
    Ext-->>Main: Temp Audio (.wav)

    note over Main: [Phase 2: Renderer Process Takes Over]
    Main->>Renderer: IPC: generate-subtitles
    activate Renderer

    note right of Renderer: useEndToEndSubtitleGeneration
    Renderer->>Main: IPC: read-focal-file
    Main-->>Renderer: Audio Buffer

    Renderer->>AI: 1. Whisper Transcription
    Renderer->>AI: 2. Gemini Glossary Extraction
    Renderer->>AI: 3. Gemini Speaker Analysis
    Renderer->>AI: 4. Gemini Translation Polishing

    AI-->>Renderer: SUBTITLE_DATA

    Renderer->>Main: IPC: subtitle-result (JSON)
    deactivate Renderer

    note over Main: [Phase 3: Post-processing]
    Main->>Main: jsonToAss/Srt()
    Main->>Main: Write to Local Disk

    opt Video Compression
        Main->>Ext: ffmpeg Video Encoding (Hardsub)
        Ext-->>Main: Final Video
    end

    Main->>User: Task Complete Notification
    deactivate Main
```

#### 8.2 Data Flow and State Management

All intermediate state and configuration is managed through the `EndToEndWizard` component, with data flow as follows:

1. **User Configuration**
   - Source: `EndToEndWizard` UI
   - Flow: Via `IPC (start-processing)` -> Main Process `EndToEndPipeline` Service
   - Content: URL, Model Selection, Translation Style, Encoding Parameters

2. **Media Stream**
   - `yt-dlp` -> Disk Temp Directory -> `ffmpeg` (Extract Audio) -> Disk WAV
   - Disk WAV -> `IPC (read-file)` -> Renderer Process Memory (ArrayBuffer) -> Web Audio API

3. **Subtitle Data**
   - Renderer Process generates `SubtitleItem[]` array
   - Passed back to Main Process via `IPC (subtitle-result)`
   - Main Process serializes object to ASS/SRT format text and writes to file

4. **Progress Feedback**
   - Each stage (Download/Transcribe/Encode) produces progress events
   - Main Process -> `IPC (progress)` -> Renderer Process `useEndToEnd` Hook -> UI Progress Bar

#### 8.3 Key IPC Channels

| Channel Name                    | Direction        | Payload           | Purpose                                                  |
| :------------------------------ | :--------------- | :---------------- | :------------------------------------------------------- |
| `end-to-end:start`              | Renderer -> Main | `EndToEndConfig`  | Start Full Auto Task                                     |
| `end-to-end:generate-subtitles` | Main -> Renderer | `path, config`    | Main Process Ready, Request Frontend to Start Generation |
| `end-to-end:subtitle-result`    | Renderer -> Main | `SubtitleItem[]`  | Frontend Complete, Return Results                        |
| `end-to-end:progress`           | Main -> Renderer | `stage, progress` | Real-time Progress Sync                                  |

---

## 🛰️ Custom Protocol for Media Playback

To bypass browser security restrictions (CSP, Sandbox) and support large file streaming, the desktop version implements a custom protocol:

### `local-video://` Protocol

- **Implementation**: `electron/main.ts`
- **Privileges**: `standard`, `secure`, `stream`, `supportFetchAPI`, `bypassCSP`.
- **Key Feature: Tailing Reader**: Support for reading "growing files" (transcoding in progress). It uses a polling mechanism to read new data as it is written to disk by FFmpeg.

---

## 📺 Video Preview & Caching Strategy

The system uses a fragmented MP4 (fMP4) transcoding strategy to balance compatibility and performance, enabling **play-while-transcoding** for immediate video preview.

### Architecture Overview

The video preview system consists of three main components:

| Component                | Location                 | Purpose                                                               |
| :----------------------- | :----------------------- | :-------------------------------------------------------------------- |
| `VideoPlayerPreview`     | `src/components/editor/` | React video player with ASS subtitle overlay                          |
| `useVideoPreview`        | `src/hooks/`             | State management for transcoding progress, video source, and playback |
| `videoPreviewTranscoder` | `electron/services/`     | FFmpeg-based transcoding service with GPU acceleration and caching    |

### Process Flow

```mermaid
sequenceDiagram
    participant R as Renderer (VideoPlayer)
    participant M as Main (PreviewTranscoder)
    participant F as FFmpeg
    participant C as Disk Cache

    R->>M: IPC (transcode-for-preview)
    M->>M: Check if transcode needed (codec check)
    alt Cached & Recent
        M-->>R: Return cached path
    else Needs Transcode
        M->>F: Spawn ffmpeg (fragmented mp4)
        F-->>C: Write .mp4 stream to cache
        M-->>R: IPC (transcode-start)
        R->>R: Load local-video://cache_path
        Note over R,C: TailingReader streams from cache
        loop Progressive Update
            M-->>R: IPC (transcode-progress)
            R->>R: Update progress bar
        end
        M-->>R: IPC (transcode complete)
    end
```

### Key Features

| Feature                   | Description                                                         |
| :------------------------ | :------------------------------------------------------------------ |
| **Progressive Playback**  | Start playing before transcoding completes via fMP4 + TailingReader |
| **GPU Acceleration**      | Auto-detects NVENC/QSV/VCE for faster transcoding                   |
| **Format Detection**      | Skips transcoding for browser-compatible formats (mp4, webm, m4v)   |
| **WYSIWYG Subtitles**     | Renders ASS subtitles using assjs in sync with video                |
| **Floating/Docked Modes** | Supports resizable floating window or docked panel                  |

### Cache Lifecycle

- **Storage**: User data directory (`/preview_cache/`).
- **Limit**: Automatically enforces a total size limit (3GB default).
- **Cleanup**: Enforced on app startup (oldest files first) and via manual UI action.

### IPC Channels

| Channel Name            | Direction       | Payload                           | Purpose                                         |
| :---------------------- | :-------------- | :-------------------------------- | :---------------------------------------------- |
| `transcode-for-preview` | Renderer → Main | `{ filePath }`                    | Request video transcoding                       |
| `transcode-start`       | Main → Renderer | `{ outputPath, duration }`        | Transcoding started, begin progressive playback |
| `transcode-progress`    | Main → Renderer | `{ percent, transcodedDuration }` | Real-time progress update                       |
| `cache:get-size`        | Renderer → Main | -                                 | Get preview cache size                          |
| `cache:clear`           | Renderer → Main | -                                 | Clear preview cache                             |

---

## 🧩 Core Module Descriptions

### 1. Generation Services Module (`src/services/generation/`) [NEW]

This is the refactored core business logic module, splitting the original Gemini API logic by responsibility:

| Submodule    | File/Directory          | Function Description                                                                          |
| :----------- | :---------------------- | :-------------------------------------------------------------------------------------------- |
| `pipeline`   | `index.ts`              | Generation Flow Orchestrator, Coordinates Transcription, Extraction, Generation Full Flow     |
|              | `pipelineCore.ts`       | **[NEW]** Shared context and dependency injection                                             |
|              | `chunkProcessor.ts`     | Single Chunk Processing Logic (Transcribe -> Wait Glossary/Speaker -> Translate)              |
|              | `translation.ts`        | Specific Translation Execution Logic                                                          |
|              | `glossaryHandler.ts`    | Glossary Application Logic                                                                    |
|              | `resultTransformers.ts` | Result Transformation and Post-processing Logic                                               |
|              | `core/BaseStep.ts`      | **[NEW]** Base step class, defines unified interface                                          |
|              | `steps/*.ts`            | **[NEW]** Step implementations (Transcription, Refinement, Alignment, Translation, Proofread) |
| `extractors` | `glossary.ts`           | Glossary Extractor (Gemini Pro + Search)                                                      |
|              | `speakerProfile.ts`     | Speaker Profile Extractor                                                                     |
| `batch`      | `proofread.ts`          | **[NEW]** Batch proofreading operations                                                       |
|              | `regenerate.ts`         | **[NEW]** Batch regenerate operations (full pipeline re-run)                                  |

### 2. Gemini API Core (`src/services/api/gemini/core/`)

Retains only the most basic API interaction capabilities:

| File         | Function Description                                            |
| :----------- | :-------------------------------------------------------------- |
| `client.ts`  | Gemini API Client Encapsulation, Handles auth, retry, and quota |
| `prompts.ts` | Basic Prompt Template Library                                   |
| `schemas.ts` | Structured Output Schema Definitions                            |

### 3. Audio Processing Module (`src/services/audio/`)

| File                 | Function Description                                                                                     |
| :------------------- | :------------------------------------------------------------------------------------------------------- |
| `segmenter.ts`       | **Smart Audio Segmenter**, Uses Silero VAD Model to Detect Voice Activity, Splits by Semantic Boundaries |
| `sampler.ts`         | Audio Sampling, Generates Audio Samples for AI Analysis                                                  |
| `decoder.ts`         | Audio Decoding, Supports Multiple Formats                                                                |
| `processor.ts`       | Audio Preprocessing, Normalization, etc.                                                                 |
| `converter.ts`       | Audio Format Conversion                                                                                  |
| `ffmpegExtractor.ts` | FFmpeg Audio Extraction (Core Logic)                                                                     |

### 4. Subtitle Processing Module (`src/services/subtitle/`)

| File                   | Function Description                                    |
| :--------------------- | :------------------------------------------------------ |
| `parser.ts`            | Subtitle Parser, Supports SRT/ASS/VTT and other formats |
| `generator.ts`         | Subtitle Export, Generates Bilingual Subtitle Files     |
| `time.ts`              | Timecode Processing Tool                                |
| `postCheck.ts`         | Subtitle Quality Post-check                             |
| `timelineValidator.ts` | Subtitle Timeline Logic Validation                      |
| `reconciler.ts`        | **[NEW] Data Reconciliation** (Merges Metadata)         |

### 5. Download Service Module (`src/services/download/`)

| File          | Function Description               |
| :------------ | :--------------------------------- |
| `download.ts` | Video Download Logic Encapsulation |
| `utils.ts`    | Download-related Utility Functions |

### 6. Electron Desktop (`electron/`)

| File                                 | Function Description                                                                |
| :----------------------------------- | :---------------------------------------------------------------------------------- |
| `main.ts`                            | Electron Main Process, Window Management, IPC Communication                         |
| `preload.ts`                         | Preload Script, Exposes Secure Node.js API                                          |
| `logger.ts`                          | **Unified Logging System**, Supports File Rotation, JSON View, and Multi-level Logs |
| `utils/paths.ts`                     | **[NEW]** Portable path resolution, supports exe-relative storage                   |
| `services/localWhisper.ts`           | Local Whisper Model Call (whisper.cpp), with GPU detection                          |
| `services/ffmpegAudioExtractor.ts`   | FFmpeg Audio Extraction, Supports Video Files                                       |
| `services/ytdlp.ts`                  | Video Download Service (YouTube/Bilibili)                                           |
| `services/videoCompressor.ts`        | Video Encoding Service (Supports NVENC/QSV/AMF Hardware Acceleration)               |
| `services/videoPreviewTranscoder.ts` | **Video Preview Transcoding**, fMP4 for progressive playback, cache management      |
| `services/endToEndPipeline.ts`       | **Full Auto Pipeline**, Orchestrates Download-Transcribe-Encode Full Flow           |
| `services/storage.ts`                | Portable storage service, config and logs stored in exe-relative directory          |

### 7. Internationalization Module (`src/locales/`, `src/i18n.ts`) [NEW]

Full i18n support powered by i18next, enabling bilingual UI (Chinese/English):

| File/Directory | Function Description                                              |
| :------------- | :---------------------------------------------------------------- |
| `i18n.ts`      | i18n Configuration Entry, Initializes i18next with React bindings |
| `locales/`     | Translation Resources Root Directory                              |
| `zh-CN/`       | Chinese (Simplified) translations, 14 namespace files             |
| `en-US/`       | English translations, mirrors zh-CN structure                     |
| `ja-JP/`       | Japanese translations, mirrors zh-CN structure (New in v2.13)     |

**Namespace Organization:**

| Namespace     | Content                                |
| :------------ | :------------------------------------- |
| `common`      | Shared texts (buttons, labels, errors) |
| `home`        | Home page content                      |
| `workspace`   | Workspace page                         |
| `editor`      | Subtitle editor                        |
| `settings`    | Settings modal                         |
| `endToEnd`    | End-to-end wizard                      |
| `modals`      | Business modals                        |
| `services`    | API service messages                   |
| `compression` | Video compression page                 |
| `download`    | Download page                          |
| `progress`    | Progress indicators                    |
| `ui`          | UI components                          |
| `app`         | App-level texts                        |

---

### 8. Settings Module (`src/components/settings/`) [Refactored in v2.13]

v2.13 refactors the settings panel into a modular tabs structure:

| File/Directory             | Function Description                                          |
| :------------------------- | :------------------------------------------------------------ |
| `SettingsModal.tsx`        | Settings modal container, manages tab switching               |
| `tabs/GeneralTab.tsx`      | General settings (language, theme, etc.)                      |
| `tabs/ServicesTab.tsx`     | API service config (Gemini, OpenAI keys)                      |
| `tabs/EnhanceTab.tsx`      | Enhancement features (glossary, speaker toggles)              |
| `tabs/PerformanceTab.tsx`  | Performance settings (concurrency, cache, etc.)               |
| `tabs/DebugTab.tsx`        | Debug options (mock mode, log level)                          |
| `tabs/AboutTab.tsx`        | **[NEW]** About page (version, Whisper status, GPU detection) |
| `AlignmentSettings.tsx`    | Alignment service configuration                               |
| `LocalWhisperSettings.tsx` | Local Whisper configuration                                   |
| `CacheManagement.tsx`      | Cache management UI                                           |

**About Page (AboutTab) Features:**

- Display app version and build info
- Local Whisper status detection
- GPU hardware acceleration detection (NVENC/QSV/AMF)
- Log file path and viewer entry
- System information overview

---

## 🔧 Technical Highlights

### Concurrency Control

```typescript
// Use Semaphore to control concurrency count
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

### Model Selection Strategy

Model configuration is centralized in `src/config/models.ts`, supporting different model selection per processing step:

| Processing Step      | Default Model          | Features                                       |
| :------------------- | :--------------------- | :--------------------------------------------- |
| `refinement`         | Gemini 2.5 Flash       | Timeline Correction (Avoids 3.0 Timestamp Bug) |
| `translation`        | Gemini 3 Flash Preview | Translation, Search Grounding                  |
| `glossaryExtraction` | Gemini 3 Pro Preview   | Multimodal, Term Extraction                    |
| `speakerProfile`     | Gemini 3 Pro Preview   | Speaker Analysis                               |
| `batchProofread`     | Gemini 3 Pro Preview   | High Quality Proofreading, Search Grounding    |

> **Note**: As of v2.13, `batchFixTimestamps` has been replaced by the `regenerate` operation. Regenerate re-runs the full pipeline (transcription → refinement → alignment → translation).

Each step can be independently configured:

- `thinkingLevel`: Thinking Depth (`none`/`low`/`medium`/`high`)
- `useSearch`: Whether to Enable Google Search
- `maxOutputTokens`: Maximum Output Tokens

### Retry Mechanism

```typescript
// Automatically retry recoverable errors
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

## 📊 Data Flow Architecture

### Main Data Flow Diagram

```mermaid
flowchart TB
    subgraph INPUT["📥 Input Layer"]
        direction LR
        URL["Video Link<br/>(URL)"]
        FILE["Media File<br/>(MP4/MP3/WAV)"]
        SRT_IN["Existing Subtitles<br/>(SRT/ASS/VTT)"]
        GLOSSARY_IN["Glossary<br/>(JSON)"]
        SETTINGS_IN["User Settings<br/>(AppSettings)"]
    end

    subgraph DECODE["🔊 Decoding Layer"]
        direction LR
        FFMPEG_EXTRACT["FFmpeg Extraction<br/>(Electron)"]
        WEB_DECODE["Web Audio API<br/>(Browser)"]

        FILE --> FFMPEG_EXTRACT
        FILE --> WEB_DECODE
        FFMPEG_EXTRACT --> AUDIO_BUFFER["AudioBuffer<br/>PCM Data"]
        WEB_DECODE --> AUDIO_BUFFER
    end

    subgraph SEGMENT["✂️ Segmentation Layer"]
        direction TB
        AUDIO_BUFFER --> VAD["Silero VAD<br/>Voice Activity Detection"]
        VAD --> SEGMENTS["VAD Segments<br/>{start, end}[]"]
        SEGMENTS --> SMART_SPLIT["Smart Split<br/>5-10 min/segment"]
        SMART_SPLIT --> CHUNKS["AudioChunk[]<br/>Multiple Audio Segments"]
        SEGMENTS --> SAMPLE_SELECT["Sample Segment Selection<br/>(For Glossary/Speaker)"]
    end

    subgraph PARALLEL_EXTRACT["⚡ Parallel Extraction Layer"]
        direction LR

        subgraph GLOSSARY_EXTRACT["Glossary Extraction"]
            SAMPLE_SELECT --> AUDIO_SAMPLE1["Sample Audio"]
            AUDIO_SAMPLE1 --> GEMINI_PRO1["Gemini 3 Pro<br/>+ Search Grounding"]
            GEMINI_PRO1 --> RAW_TERMS["GlossaryExtractionResult[]"]
            RAW_TERMS --> USER_CONFIRM["User Confirmation"]
            USER_CONFIRM --> FINAL_GLOSSARY["Final Glossary<br/>GlossaryItem[]"]
        end

        subgraph SPEAKER_EXTRACT["Speaker Extraction"]
            SAMPLE_SELECT --> AUDIO_SAMPLE2["Sample Audio"]
            AUDIO_SAMPLE2 --> GEMINI_PRO2["Gemini 3 Pro"]
            GEMINI_PRO2 --> SPEAKER_PROFILES["SpeakerProfile[]<br/>{id, name, style, tone}"]
        end
    end

    subgraph CHUNK_PIPELINE["🔄 Chunk Processing Pipeline"]
        direction TB

        CHUNKS --> TRANSCRIBE["Whisper Transcription<br/>(Cloud/Local)"]
        TRANSCRIBE --> RAW_SUBS["Raw Subtitles<br/>{startTime, endTime, original}[]"]

        RAW_SUBS --> WAIT_DEPS["Wait for Dependencies"]
        FINAL_GLOSSARY -.-> WAIT_DEPS
        SPEAKER_PROFILES -.-> WAIT_DEPS

        WAIT_DEPS --> REFINEMENT["Gemini 3 Flash<br/>Proofreading & Timeline Correction"]
        REFINEMENT --> REFINED_SUBS["Proofread Subtitles<br/>+ speaker Labels"]

        REFINED_SUBS --> ALIGNMENT["CTC Aligner<br/>(Timestamp Correction)"]
        ALIGNMENT --> ALIGNED_SUBS["Aligned Subtitles<br/>+ alignmentScore"]

        ALIGNED_SUBS --> TRANSLATION["Gemini 3 Flash<br/>Translation"]
        TRANSLATION --> TRANSLATED_SUBS["Bilingual Subtitles<br/>{original, translated, speaker}[]"]
    end

    subgraph OUTPUT["📤 Output Layer"]
        direction LR
        TRANSLATED_SUBS --> MERGE["Merge & Renumber"]
        MERGE --> SRT_OUT["SRT File<br/>(Mono/Bilingual)"]
        MERGE --> ASS_OUT["ASS File<br/>(Styled Subtitles)"]
        MERGE --> EDITOR["Editor Display"]
        MERGE --> VIDEO_PREVIEW["Video Preview<br/>(WYSIWYG Playback)"]
        FINAL_GLOSSARY --> GLOSSARY_OUT["Update Glossary<br/>(JSON)"]

        SRT_OUT -.-> VIDEO_OUT["Encoded Video<br/>(MP4/Hardsub)"]
    end

    SRT_IN --> REFINED_SUBS
    GLOSSARY_IN --> FINAL_GLOSSARY
    SETTINGS_IN --> TRANSCRIBE
    SETTINGS_IN --> REFINEMENT
    SETTINGS_IN --> TRANSLATION
    FILE -.-> VIDEO_OUT
```

### Data Type Conversion Chain

```mermaid
flowchart LR
    subgraph AUDIO_CHAIN["Audio Data Chain"]
        FILE2["File<br/>(Binary)"] --> AB["AudioBuffer<br/>(PCM Float32)"]
        AB --> WAV["Blob<br/>(WAV)"]
        WAV --> B64["Base64<br/>(for Gemini)"]
    end

    subgraph SUBTITLE_CHAIN["Subtitle Data Chain"]
        RAW["RawSegment<br/>{start, end, text}"]
        --> ITEM["SubtitleItem<br/>{id, startTime, endTime,<br/>original, translated, speaker}"]
        --> EXPORT["SRT/ASS String"]
    end

    subgraph GLOSSARY_CHAIN["Glossary Data Chain"]
        EXTRACT["GlossaryExtractionResult<br/>{chunkIndex, terms[], confidence}"]
        --> MERGE2["Merge & Deduplicate"]
        --> ITEM2["GlossaryItem<br/>{term, translation, category, notes}"]
    end

    subgraph SPEAKER_CHAIN["Speaker Data Chain"]
        PROFILE["SpeakerProfile<br/>{id, characteristics}"]
        --> MATCH["Speaker Matching"]
        --> SPEAKER_ID["speaker: string<br/>(Subtitle Label)"]
    end
```

### State Data Flow

```mermaid
stateDiagram-v2
    [*] --> Idle: Initial State

    Idle --> Decoding: Upload File
    Decoding --> Segmenting: Decoding Complete
    Segmenting --> Processing: Segmentation Complete

    state Processing {
        [*] --> Parallel

        state Parallel {
            GlossaryExtraction --> UserConfirmation
            SpeakerExtraction --> SpeakersReady
        }

        state ChunkProcessing {
            Transcribing --> WaitingDeps
            WaitingDeps --> Refining: Dependencies Ready
            Refining --> Aligning: Refinement Done
            Aligning --> Translating: Alignment Done
            Translating --> ChunkDone
        }

        UserConfirmation --> ChunkProcessing: Glossary Confirmed
        SpeakersReady --> ChunkProcessing: Speakers Ready
    }

    Processing --> Completed: All Chunks Complete
    Completed --> [*]: Display Results

    Idle --> Error: Decoding Failed
    Processing --> Error: API Error
    Error --> Idle: Retry
```

---

## 🚀 Deployment Architecture

```mermaid
graph TB
    subgraph "Web Version Deployment"
        VERCEL["Vercel<br/>Auto CI/CD"]
        CLOUDFLARE["Cloudflare Pages"]
        NETLIFY["Netlify"]
        RENDER["Render"]
    end

    subgraph "Desktop Version"
        WIN["Windows<br/>Portable .exe"]
        MAC["macOS<br/>.dmg"]
        LINUX["Linux<br/>AppImage"]
    end

    subgraph "External Services"
        GEMINI_API["Gemini API"]
        OPENAI_API["OpenAI Whisper API"]
    end

    VERCEL --> GEMINI_API
    VERCEL --> OPENAI_API
    WIN --> GEMINI_API
    WIN --> OPENAI_API
    WIN --> LOCAL["Local Whisper<br/>(whisper.cpp)"]
```

---

## 📝 Development Guide

### Environment Requirements

- Node.js 18+
- npm or yarn

### Quick Start

```bash
# Install Dependencies
yarn install

# Web Development Mode
yarn dev

# Electron Development Mode
yarn electron:dev

# Build Electron Application
yarn electron:build
```

### Environment Variables

```env
GEMINI_API_KEY=your_gemini_key    # Required: Translation and Proofreading
OPENAI_API_KEY=your_openai_key    # Optional: Cloud Whisper
```

---

## 📚 References

- [Google Gemini API Documentation](https://ai.google.dev/docs)
- [OpenAI Whisper API](https://platform.openai.com/docs/guides/speech-to-text)
- [whisper.cpp Project](https://github.com/ggerganov/whisper.cpp)
- [Silero VAD](https://github.com/snakers4/silero-vad)
