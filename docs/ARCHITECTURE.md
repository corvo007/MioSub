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

        subgraph GENERATION_SVC["Generation Services (New)"]
            direction TB
            PIPELINE["pipeline/<br/>index.ts (Orchestrator)<br/>chunkProcessor.ts"]
            EXTRACTORS["extractors/<br/>glossary.ts<br/>speakerProfile.ts"]
            BATCH_OPS["batch/<br/>operations.ts"]
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

        subgraph TYPES_GROUP["Types"]
            SUBTITLE_TYPE["subtitle.ts"]
            SETTINGS_TYPE["settings.ts"]
            API_TYPE["api.ts"]
            GLOSSARY_TYPE["glossary.ts"]
        end
    end

    subgraph ELECTRON_LAYER["Electron Layer (Desktop Only)"]
        direction LR
        MAIN_PROCESS["main.ts (15KB)<br/>Main Process"]
        PRELOAD_SCRIPT["preload.ts<br/>Security Bridge"]

        subgraph ELECTRON_SVC["Desktop Services"]
            LOCAL_WHISPER_SVC["localWhisper.ts (13KB)"]
            FFMPEG_SVC["ffmpegAudioExtractor.ts"]
            COMPRESSOR_SVC["videoCompressor.ts"]
            YTDLP_SVC["ytdlp.ts"]
            PIPELINE_SVC["endToEndPipeline.ts<br/>Full Auto Pipeline"]
            PREVIEW_SVC["videoPreviewTranscoder.ts<br/>Video Preview & Caching"]
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
        BATCH_OPS["generation/batch/operations.ts"]
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
│   │   ├── 📂 editor/               # Subtitle Editor Components (SubtitleRow, Batch, etc.)
│   │   ├── 📂 pages/                # Page-level Components (HomePage, WorkspacePage, etc.)
│   │   ├── 📂 ui/                   # Base UI Component Library (Modal, Toggle, TextInput...)
│   │   ├── 📂 settings/             # Settings-related Components (SettingsModal, SettingsPanel, etc.)
│   │   ├── 📂 layout/               # Layout Containers
│   │   ├── 📂 modals/               # Business Modals (SettingsModal, etc.)
│   │   ├── 📂 endToEnd/             # End-to-End Wizard Components
│   │   └── 📂 ...                   # Other feature-divided component directories
│   │
│   ├── 📂 hooks/                    # React Hooks
│   │   ├── 📂 useWorkspaceLogic/    # Core Workspace Logic (Split into multiple modules)
│   │   │   ├── 📄 index.ts          # Entry
│   │   │   └── 📄 ...               # Sub-logic Hooks
│   │   ├── 📄 useHardwareAcceleration.ts # Hardware Acceleration State
│   │   ├── 📄 useSettings.ts        # Settings Management
│   │   ├── 📄 useDownload.ts        # Download Logic
│   │   └── ...                      # Other Feature Hooks
│   │
│   ├── 📂 locales/                  # [NEW] Internationalization Resources
│   │   ├── 📂 zh-CN/                # Chinese (Simplified)
│   │   │   ├── 📄 common.json       # Common Texts
│   │   │   ├── 📄 home.json         # Home Page
│   │   │   ├── 📄 editor.json       # Editor
│   │   │   ├── 📄 settings.json     # Settings
│   │   │   ├── 📄 endToEnd.json     # End-to-End Wizard
│   │   │   └── 📄 ...               # Other Namespaces
│   │   └── 📂 en-US/                # English
│   │       └── 📄 ...               # Same Structure
│   │
│   ├── 📂 services/                 # Service Layer (Pure Logic)
│   │   ├── 📂 api/                  # API Integration (Gemini Core, OpenAI)
│   │   │   └── 📂 gemini/           # Gemini Basic Client and Config
│   │   │       ├── 📂 core/         # Core API Logic
│   │   │       └── 📂 utils/        # API Utility Functions
│   │   ├── 📂 generation/           # Generation Services (Core Business Logic)
│   │   │   ├── 📂 pipeline/         # Complete Pipeline (Orchestrator, ChunkProcessor)
│   │   │   ├── 📂 extractors/       # Information Extraction (Glossary, Speaker)
│   │   │   ├── 📂 batch/            # Batch Operations
│   │   │   └── 📂 debug/            # Debug Tools
│   │   ├── 📂 audio/                # Audio Processing (Segmenter, Sampler)
│   │   ├── 📂 subtitle/             # Subtitle Parsing and Generation (Parser, Generator)
│   │   ├── 📂 download/             # Download Service Logic
│   │   └── 📂 utils/                # Common Service Tools (Logger, URL Validation)
│   │
│   ├── 📂 config/                   # Configuration Module
│   │   ├── 📄 index.ts              # Config Export Entry
│   │   └── 📄 models.ts             # Model Config (Step→Model Mapping)
│   │
│   ├── 📂 lib/                      # Common Libraries
│   │   ├── 📄 cn.ts                 # Tailwind Classname Merge Tool
│   │   └── 📄 text.ts               # Text Processing Tool
│   │
│   ├── 📂 types/                    # TypeScript Type Definitions
│   └── 📂 workers/                  # Web Workers
│
├── 📂 electron/                     # Electron Desktop Code
│   ├── 📄 main.ts                   # Main Process Entry
│   ├── 📄 preload.ts                # Preload Script
│   └── 📂 services/                 # Desktop Services (Node.js Env)
│       ├── 📄 localWhisper.ts       # Local Whisper Call
│       ├── 📄 videoPreviewTranscoder.ts # [NEW] Video Preview & Caching
│       ├── 📄 logger.ts             # Unified Logging Service
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
    C4 -->|"acquire()"| R3
```

**Configuration Explanation:**

| Semaphore                      | Purpose                    | Default Concurrency | Config Item          |
| :----------------------------- | :------------------------- | :------------------ | :------------------- |
| `transcriptionSemaphore`       | Controls Whisper API Calls | Local: 1, Cloud: 5  | `whisperConcurrency` |
| `refinementSemaphore`          | Controls Gemini Flash API  | 5                   | `concurrencyFlash`   |
| (Glossary Extraction Internal) | Controls Gemini Pro API    | 2                   | `concurrencyPro`     |

---

### 3. Chunk Internal 4-Stage Pipeline

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
    TSem-->>Chunk: Permission Granted
    Chunk->>Whisper: transcribe(audioChunk)
    Whisper-->>Chunk: rawSegments[]
    Chunk->>TSem: release()
    deactivate TSem

    Note over Chunk: Stage 2: Wait for Glossary (Non-blocking)
    Chunk->>GState: await get()
    Note right of GState: If glossary extraction not complete<br/>or user not confirmed, wait
    GState-->>Chunk: finalGlossary[]

    Note over Chunk: Stage 3: Wait for Speaker Profiles
    Chunk->>SProm: await speakerProfiles
    Note right of SProm: If speaker recognition not complete, wait
    SProm-->>Chunk: SpeakerProfile[]

    Note over Chunk: Stage 4: Refinement + Translation
    Chunk->>RSem: acquire()
    activate RSem
    RSem-->>Chunk: Permission Granted

    Chunk->>Gemini: Refinement (Audio+Text)
    Note right of Gemini: Timeline Correction<br/>Apply Glossary<br/>Speaker Matching
    Gemini-->>Chunk: refinedSegments[]

    Chunk->>Gemini: Translation (Batch)
    Gemini-->>Chunk: translatedItems[]

    Chunk->>RSem: release()
    deactivate RSem

    Note over Chunk: Complete, Update Intermediate Results
```

---

### 4. Glossary Extraction and User Interaction Flow

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

### 5. Speaker Recognition Position in Pipeline

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
| Translation   | (Within Refinement Semaphore)               | Completed Together with Refinement              |

---

### 6. Desktop Full Workflow (Download-Create-Encode)

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

        EDIT --> SRT_ASS["Export Subtitle File<br/>(.srt / .ass)"]
    end

    subgraph COMPRESS["🎬 Final Encoding"]
        direction TB
        LOCAL_FILE --> COMPRESSOR["Video Encoding Engine<br/>(FFmpeg)"]
        EDIT -.-|"Auto Pass Subtitle Path"| COMPRESSOR
        SRT_ASS -.-|"Manually Select Subtitle"| COMPRESSOR

        COMPRESSOR --> OUTPUT["Hardsubbed Video<br/>(Hardsub Video)"]
    end

    DOWNLOAD --> PROCESS
    PROCESS --> COMPRESS
```

---

### 7. Full Auto End-to-End Mode (End-to-End Pipeline)

This is an Electron-exclusive core feature that coordinates Main Process (resource scheduling) and Renderer Process (AI computation) through IPC communication, achieving "one-click cooked content".

#### 7.1 Cross-Process Interaction Architecture

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

#### 7.2 Data Flow and State Management

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

#### 7.3 Key IPC Channels

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

The system uses a fragmented MP4 (fMP4) transcoding strategy to balance compatibility and performance.

### Process Flow

```mermaid
sequenceDiagram
    participant R as Renderer (VideoPlayer)
    participant M as Main (PreviewTranscoder)
    participant F as FFmpeg
    participant C as Disk Cache

    R->>M: IPC (video-preview:transcode)
    M->>M: Check if transcode needed (codec check)
    alt Cached & Recent
        M-->>R: Return cached path
    else Needs Transcode
        M->>F: Spawn ffmpeg (fragmented mp4)
        F-->>C: Write .mp4 stream to cache
        M-->>R: IPC (transcode-start)
        R->>R: Load local-video://cache_path
        Note over R,C: TailingReader streams from cache
    end
```

### Cache Lifecycle

- **Storage**: User data directory (`/preview_cache/`).
- **Limit**: Automatically enforces a total size limit (e.g., 2GB).
- **Cleanup**: Enforced on app startup and via manual UI action.
  | `video-preview:transcode` | Renderer -> Main | `{ filePath }` | Request video transcoding for preview |
  | `video-preview:transcode-start` | Main -> Renderer | `{ outputPath }` | Transcoding started |
  | `video-preview:transcode-progress` | Main -> Renderer | `{ percent }` | Transcoding progress update |
  | `video-preview:needs-transcode` | Renderer -> Main | `filePath` | Check if video needs transcoding |
  | `cache:get-size` | Renderer -> Main | - | Get preview cache size |
  | `cache:clear` | Renderer -> Main | - | Clear preview cache |

---

## 🧩 Core Module Descriptions

### 1. Generation Services Module (`src/services/generation/`) [NEW]

This is the refactored core business logic module, splitting the original Gemini API logic by responsibility:

| Submodule    | File/Directory          | Function Description                                                                      |
| :----------- | :---------------------- | :---------------------------------------------------------------------------------------- |
| `pipeline`   | `index.ts`              | Generation Flow Orchestrator, Coordinates Transcription, Extraction, Generation Full Flow |
|              | `chunkProcessor.ts`     | Single Chunk Processing Logic (Transcribe -> Wait Glossary/Speaker -> Translate)          |
|              | `translation.ts`        | Specific Translation Execution Logic                                                      |
|              | `glossaryHandler.ts`    | Glossary Application Logic                                                                |
|              | `resultTransformers.ts` | Result Transformation and Post-processing Logic                                           |
| `extractors` | `glossary.ts`           | Glossary Extractor (Gemini Pro + Search)                                                  |
|              | `speakerProfile.ts`     | Speaker Profile Extractor                                                                 |
| `batch`      | `operations.ts`         | Batch Proofreading and Timeline Fix Operations                                            |

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

### 5. Download Service Module (`src/services/download/`)

| File          | Function Description               |
| :------------ | :--------------------------------- |
| `download.ts` | Video Download Logic Encapsulation |
| `utils.ts`    | Download-related Utility Functions |

### 6. Electron Desktop (`electron/`)

| File                               | Function Description                                                      |
| :--------------------------------- | :------------------------------------------------------------------------ |
| `main.ts`                          | Electron Main Process, Window Management, IPC Communication               |
| `preload.ts`                       | Preload Script, Exposes Secure Node.js API                                |
| `logger.ts`                        | **Unified Logging System**, Supports File Rotation and Multi-level Logs   |
| `services/localWhisper.ts`         | Local Whisper Model Call (whisper.cpp)                                    |
| `services/ffmpegAudioExtractor.ts` | FFmpeg Audio Extraction, Supports Video Files                             |
| `services/ytdlp.ts`                | Video Download Service (YouTube/Bilibili)                                 |
| `services/videoCompressor.ts`      | Video Encoding Service (Supports GPU Acceleration)                        |
| `services/endToEndPipeline.ts`     | **Full Auto Pipeline**, Orchestrates Download-Transcribe-Encode Full Flow |

### 7. Internationalization Module (`src/locales/`, `src/i18n.ts`) [NEW]

Full i18n support powered by i18next, enabling bilingual UI (Chinese/English):

| File/Directory | Function Description                                              |
| :------------- | :---------------------------------------------------------------- |
| `i18n.ts`      | i18n Configuration Entry, Initializes i18next with React bindings |
| `locales/`     | Translation Resources Root Directory                              |
| `zh-CN/`       | Chinese (Simplified) translations, 14 namespace files             |
| `en-US/`       | English translations, mirrors zh-CN structure                     |

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
| `batchFixTimestamps` | Gemini 2.5 Flash       | Timeline Fix                                   |

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

        REFINED_SUBS --> TRANSLATION["Gemini 3 Flash<br/>Translation"]
        TRANSLATION --> TRANSLATED_SUBS["Bilingual Subtitles<br/>{original, translated, speaker}[]"]
    end

    subgraph OUTPUT["📤 Output Layer"]
        direction LR
        TRANSLATED_SUBS --> MERGE["Merge & Renumber"]
        MERGE --> SRT_OUT["SRT File<br/>(Mono/Bilingual)"]
        MERGE --> ASS_OUT["ASS File<br/>(Styled Subtitles)"]
        MERGE --> EDITOR["Editor Display"]
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
            Refining --> Translating
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
