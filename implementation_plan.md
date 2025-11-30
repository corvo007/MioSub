# 阶段 3: 服务层重构 - 超详细实施计划

## 概述

将 `src/utils.ts` (858行), `src/gemini.ts` (1508行), `src/glossaryUtils.ts` (191行) 拆分为模块化的服务层架构。

**重构原则:**
1. **单一职责**: 每个服务模块只负责一个明确的功能领域
2. **依赖注入**: API keys 和配置通过参数传递，不硬编码
3. **最小50行规则**: 每次修改不超过50行
4. **增量验证**: 每完成一个服务模块立即验证构建

---

## 目标架构

```
src/services/
├── api/
│   ├── gemini/
│   │   ├── client.ts           # GoogleGenAI 客户端初始化和配置
│   │   ├── retry.ts            # 重试逻辑和错误处理
│   │   ├── generator.ts        # 内容生成相关函数
│   │   └── index.ts            # 导出所有 Gemini API 函数
│   ├── openai/
│   │   ├── whisper.ts          # Whisper API 调用
│   │   ├── chat.ts             # GPT-4o Audio Chat API
│   │   ├── transcribe.ts       # 统一的 transcribeAudio 接口
│   │   └── index.ts            # 导出所有 OpenAI API 函数
│   └── index.ts                # 导出所有 API 服务
├── audio/
│   ├── decoder.ts              # 音频解码 (decodeAudio, decodeAudioWithRetry)
│   ├── processor.ts            # 音频处理 (sliceAudioBuffer, audioBufferToWav)
│   ├── converter.ts            # 文件格式转换 (blobToBase64, fileToBase64)
│   ├── segmenter.ts            # 智能分段 (SmartSegmenter 类)
│   └── index.ts                # 导出所有音频服务
├── subtitle/
│   ├── time.ts                 # 时间格式化 (formatTime, timeToSeconds, normalizeTimestamp, toAssTime)
│   ├── parser.ts               # 解析器 (parseSrt, parseAss, parseGeminiResponse, extractJsonArray)
│   ├── generator.ts            # 生成器 (generateSrtContent, generateAssContent)
│   ├── downloader.ts           # 下载功能 (downloadFile)
│   └── index.ts                # 导出所有字幕服务
├── glossary/
│   ├── crud.ts                 # CRUD 操作 (create, rename, export, import, validate)
│   ├── merger.ts               # 合并逻辑 (mergeGlossaryResults)
│   ├── selector.ts             # 选择器 (selectChunksByDuration)
│   ├── extractor.ts            # AI 提取逻辑 (extractGlossaryFromAudio, retryGlossaryExtraction)
│   ├── state.ts                # 状态管理 (GlossaryState 类)
│   └── index.ts                # 导出所有术语表服务
├── generation/
│   ├── pipeline.ts             # 主生成流程 (generateSubtitles)
│   ├── batch.ts                # 批处理逻辑 (translateBatch, processTranslationBatchWithRetry)
│   └── index.ts                # 导出生成服务
└── utils/
    ├── logger.ts               # 日志工具 (Logger 类, logger 实例)
    ├── concurrency.ts          # 并发控制 (mapInParallel)
    └── index.ts                # 导出工具函数
```

---

## 详细迁移步骤

### 步骤 1: 提取日志工具 (utils/logger.ts)
**优先级: 最高** - 其他模块都依赖 logger

#### 1.1 创建 `src/services/utils/logger.ts`
**迁移内容** (从 `src/utils.ts` 行 746-855):
- `LogLevel` enum (5行)
- `LogEntry` interface (6行)
- `Logger` class (90行)
- `logger` 实例导出 (1行)

**完整代码示例:**
```typescript
// src/services/utils/logger.ts
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

export interface LogEntry {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  data?: any;
}

class Logger {
  // ... 完整的 Logger 类实现 ...
}

export const logger = new Logger();
```

**修改行数**: ~102行

**验证步骤:**
1. ✓ 文件创建成功
2. ✓ 运行 `npm run build` 无错误
3. ✓ 在 `src/App.tsx` 中临时添加 `import { logger } from '@/services/utils/logger'` 验证路径别名

---

### 步骤 2: 提取并发工具 (utils/concurrency.ts)

#### 2.1 创建 `src/services/utils/concurrency.ts`
**迁移内容** (从 `src/utils.ts` 行 716-743):
- `mapInParallel<T, R>` 函数 (28行)

**完整代码示例:**
```typescript
// src/services/utils/concurrency.ts
export async function mapInParallel<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  const worker = async () => {
    while (currentIndex < items.length) {
      const i = currentIndex++;
      if (i >= items.length) break;
      try {
        results[i] = await fn(items[i], i);
      } catch (e) {
        throw e;
      }
    }
  };

  const workers = Array(Math.min(items.length, concurrency))
    .fill(null)
    .map(() => worker());

  await Promise.all(workers);
  return results;
}
```

**验证步骤:**
1. ✓ 构建通过
2. ✓ 创建 `src/services/utils/index.ts` 导出所有工具

---

### 步骤 3: 提取时间工具 (subtitle/time.ts)

#### 3.1 创建 `src/services/subtitle/time.ts`
**迁移内容** (从 `src/utils.ts`):
- `formatTime` (行 6-15, 10行)
- `timeToSeconds` (行 17-42, 26行)
- `normalizeTimestamp` (行 44-85, 42行)
- `toAssTime` (行 87-97, 11行)

**代码示例:**
```typescript
// src/services/subtitle/time.ts

/**
 * Formats seconds to HH:MM:SS,mmm
 */
export const formatTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
};

/**
 * Parses HH:MM:SS,mmm or HH:MM:SS.mmm to seconds (float)
 */
export const timeToSeconds = (timeStr: string): number => {
  // ... 完整实现 ...
};

/**
 * Normalizes timestamp to strictly HH:MM:SS,mmm format
 */
export const normalizeTimestamp = (timeStr: string, maxDuration?: number): string => {
  // ... 完整实现 ...
};

/**
 * Converts normalized HH:MM:SS,mmm to ASS format H:MM:SS.cc
 */
export const toAssTime = (normalizedTime: string): string => {
  // ... 完整实现 ...
};
```

**总行数**: ~89行

**验证步骤:**
1. ✓ 构建通过
2. ✓ 在浏览器控制台测试: `formatTime(125.5)` 应返回 `"00:02:05,500"`

---

### 步骤 4: 提取音频解码器 (audio/decoder.ts)

#### 4.1 创建 `src/services/audio/decoder.ts`
**迁移内容** (从 `src/utils.ts` 和 `src/gemini.ts`):
- `decodeAudio` (utils.ts 行 495-501, 7行)
- `decodeAudioWithRetry` (gemini.ts 行 57-71, 15行)

**代码示例:**
```typescript
// src/services/audio/decoder.ts
import { logger } from '@/services/utils/logger';

/**
 * Decode audio file to AudioBuffer
 */
export const decodeAudio = async (file: File): Promise<AudioBuffer> => {
  const arrayBuffer = await file.arrayBuffer();
  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContext) throw new Error("Web Audio API not supported");
  const ctx = new AudioContext();
  return await ctx.decodeAudioData(arrayBuffer);
};

/**
 * Decode audio with automatic retry on failure
 */
export async function decodeAudioWithRetry(file: File, retries = 3): Promise<AudioBuffer> {
  for (let i = 0; i < retries; i++) {
    try {
      return await decodeAudio(file);
    } catch (e: any) {
      if (i < retries - 1) {
        logger.warn(`Audio decoding failed. Retrying...`, { attempt: i + 1, error: e.message });
        await new Promise(r => setTimeout(r, 1000));
      } else {
        throw e;
      }
    }
  }
  throw new Error("Audio decoding failed after retries.");
}
```

**总行数**: ~32行

---

### 步骤 5: 提取音频处理器 (audio/processor.ts)

#### 5.1 创建 `src/services/audio/processor.ts`
**迁移内容** (从 `src/utils.ts`):
- `sliceAudioBuffer` (行 503-525, 23行)
- `audioBufferToWav` (行 527-571, 45行)

**代码示例:**
```typescript
// src/services/audio/processor.ts

/**
 * Slice audio buffer to a specific time range and convert to WAV
 */
export const sliceAudioBuffer = async (
  originalBuffer: AudioBuffer, 
  start: number, 
  end: number
): Promise<Blob> => {
  // ... 完整实现 (23行) ...
};

/**
 * Convert AudioBuffer to WAV Blob
 */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  // ... 完整实现 (45行) ...
}
```

**总行数**: ~68行

---

### 步骤 6: 提取音频转换器 (audio/converter.ts)

#### 6.1 创建 `src/services/audio/converter.ts`
**迁移内容** (从 `src/utils.ts`):
- `fileToBase64` (行 255-266, 12行)
- `blobToBase64` (行 268-279, 12行)

**代码示例:**
```typescript
// src/services/audio/converter.ts

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
};

export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
};
```

**总行数**: ~24行

---

### 步骤 7: 移动音频分段器 (audio/segmenter.ts)

#### 7.1 移动 `src/smartSegmentation.ts` → `src/services/audio/segmenter.ts`

**文件操作:**
```powershell
Move-Item src/smartSegmentation.ts src/services/audio/segmenter.ts
```

#### 7.2 更新 `src/services/audio/segmenter.ts` 的导入
**修改内容** (只改第5-6行):
```typescript
// 修改前
import { SubtitleItem } from "@/types/subtitle";
import { logger } from "./utils";

// 修改后
import { SubtitleItem } from "@/types/subtitle";
import { logger } from "@/services/utils/logger";
```

**修改行数**: 2行

#### 7.3 创建 `src/services/audio/index.ts`
```typescript
// src/services/audio/index.ts
export * from './decoder';
export * from './processor';
export * from './converter';
export { SmartSegmenter } from './segmenter';
```

**验证步骤:**
1. ✓ 构建通过
2. ✓ 搜索代码中所有 `import.*smartSegmentation` 并更新为 `@/services/audio`

---

### 步骤 8: 提取字幕解析器 (subtitle/parser.ts)

#### 8.1 创建 `src/services/subtitle/parser.ts`
**迁移内容** (从 `src/utils.ts`):
- `parseSrt` (行 101-170, 70行)
- `parseAss` (行 172-251, 80行)
- `extractJsonArray` (行 363-403, 41行)
- `parseGeminiResponse` (行 405-491, 87行)

**代码示例:**
```typescript
// src/services/subtitle/parser.ts
import { SubtitleItem, GeminiSubtitleSchema, OpenAIWhisperSegment } from '@/types/subtitle';
import { timeToSeconds, normalizeTimestamp, formatTime } from './time';

export const parseSrt = (content: string): SubtitleItem[] => {
  // ... 完整实现 (70行) ...
};

export const parseAss = (content: string): SubtitleItem[] => {
  // ... 完整实现 (80行) ...
};

export const extractJsonArray = (text: string): string | null => {
  // ... 完整实现 (41行) ...
};

export const parseGeminiResponse = (
  jsonResponse: string | null | undefined, 
  maxDuration?: number
): SubtitleItem[] => {
  // ... 完整实现 (87行) ...
};
```

**总行数**: ~278行 (分成两次提交)

**拆分策略:**
- 第一次提交: `parseSrt`, `parseAss` (~150行)
- 第二次提交: `extractJsonArray`, `parseGeminiResponse` (~128行)

---

### 步骤 9: 提取字幕生成器 (subtitle/generator.ts)

#### 9.1 创建 `src/services/subtitle/generator.ts`
**迁移内容** (从 `src/utils.ts`):
- `generateSrtContent` (行 283-294, 12行)
- `generateAssContent` (行 296-345, 50行)

**代码示例:**
```typescript
// src/services/subtitle/generator.ts
import { SubtitleItem } from '@/types/subtitle';
import { toAssTime } from './time';

export const generateSrtContent = (
  subtitles: SubtitleItem[], 
  bilingual: boolean = true
): string => {
  // ... 完整实现 ...
};

export const generateAssContent = (
  subtitles: SubtitleItem[], 
  title: string, 
  bilingual: boolean = true
): string => {
  // ... 完整实现 ...
};
```

**总行数**: ~62行

---

### 步骤 10: 提取字幕下载器 (subtitle/downloader.ts)

#### 10.1 创建 `src/services/subtitle/downloader.ts`
**迁移内容** (从 `src/utils.ts`):
- `downloadFile` (行 347-361, 15行)

**代码示例:**
```typescript
// src/services/subtitle/downloader.ts
import { OutputFormat } from '@/types/subtitle';

export const downloadFile = (
  filename: string, 
  content: string, 
  format: OutputFormat
) => {
  const blob = new Blob([content], { 
    type: format === 'srt' ? 'text/plain' : 'text/plain' 
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
```

**总行数**: ~20行

#### 10.2 创建 `src/services/subtitle/index.ts`
```typescript
export * from './time';
export * from './parser';
export * from './generator';
export * from './downloader';
```

---

### 步骤 11: 提取术语表 CRUD (glossary/crud.ts)

#### 11.1 创建 `src/services/glossary/crud.ts`
**迁移内容** (从 `src/glossaryUtils.ts`):
- `createGlossary` (行 6-15, 10行)
- `renameGlossary` (行 20-26, 7行)
- `validateGlossaryItem` (行 127-140, 14行)
- `exportGlossary` (行 145-147, 3行)
- `importGlossary` (行 152-176, 25行)
- `migrateFromLegacyGlossary` (行 181-190, 10行)

**代码示例:**
```typescript
// src/services/glossary/crud.ts
import { GlossaryItem, Glossary } from '@/types/glossary';

export function createGlossary(name: string): Glossary {
  // ... 完整实现 ...
}

export function renameGlossary(glossary: Glossary, newName: string): Glossary {
  // ... 完整实现 ...
}

export function validateGlossaryItem(item: GlossaryItem): GlossaryItem | null {
  // ... 完整实现 ...
}

export function exportGlossary(glossary: Glossary): string {
  // ... 完整实现 ...
}

export function importGlossary(jsonContent: string): Glossary {
  // ... 完整实现 ...
}

export function migrateFromLegacyGlossary(legacyItems: GlossaryItem[]): Glossary {
  // ... 完整实现 ...
}
```

**总行数**: ~69行

---

### 步骤 12: 提取术语表合并器 (glossary/merger.ts)

#### 12.1 创建 `src/services/glossary/merger.ts`
**迁移内容** (从 `src/glossaryUtils.ts`):
- `mergeGlossaryResults` (行 61-122, 62行)

**代码示例:**
```typescript
// src/services/glossary/merger.ts
import { GlossaryItem, GlossaryExtractionResult } from '@/types/glossary';

export function mergeGlossaryResults(
  results: GlossaryExtractionResult[],
  existingGlossary: GlossaryItem[] = []
): {
  unique: GlossaryItem[];
  duplicates: Map<string, GlossaryItem[]>;
  conflicts: Array<{ term: string; options: GlossaryItem[]; hasExisting: boolean }>;
} {
  // ... 完整实现 (62行) ...
}
```

**总行数**: ~62行

---

### 步骤 13: 提取术语表选择器 (glossary/selector.ts)

#### 13.1 创建 `src/services/glossary/selector.ts`
**迁移内容** (从 `src/glossaryUtils.ts`):
- `selectChunksByDuration` (行 35-54, 20行)

**代码示例:**
```typescript
// src/services/glossary/selector.ts

export function selectChunksByDuration(
  chunks: { index: number; start: number; end: number }[],
  sampleMinutes: number | 'all',
  chunkDuration: number
): { index: number; start: number; end: number }[] {
  if (sampleMinutes === 'all') {
    return chunks;
  }

  const targetSeconds = sampleMinutes * 60;
  const chunksNeeded = Math.ceil(targetSeconds / chunkDuration);

  if (chunksNeeded >= chunks.length) {
    return chunks;
  }

  return chunks.slice(0, chunksNeeded);
}
```

**总行数**: ~20行

---

### 步骤 14: 提取 OpenAI API 服务

#### 14.1 创建 `src/services/api/openai/whisper.ts`
**迁移内容** (从 `src/utils.ts`):
- `transcribeWithWhisper` (行 584-635, 52行)

**代码示例:**
```typescript
// src/services/api/openai/whisper.ts
import { SubtitleItem, OpenAIWhisperSegment } from '@/types/subtitle';
import { formatTime } from '@/services/subtitle/time';
import { logger } from '@/services/utils/logger';

export const transcribeWithWhisper = async (
  audioBlob: Blob, 
  apiKey: string, 
  model: string, 
  endpoint?: string, 
  timeout?: number
): Promise<SubtitleItem[]> => {
  // ... 完整实现 (52行) ...
};
```

**总行数**: ~52行

#### 14.2 创建 `src/services/api/openai/chat.ts`
**迁移内容** (从 `src/utils.ts`):
- `transcribeWithOpenAIChat` (行 637-712, 76行)

**总行数**: ~76行

#### 14.3 创建 `src/services/api/openai/transcribe.ts`
**迁移内容** (从 `src/utils.ts`):
- `transcribeAudio` (行 575-582, 8行)

**代码示例:**
```typescript
// src/services/api/openai/transcribe.ts
import { SubtitleItem } from '@/types/subtitle';
import { logger } from '@/services/utils/logger';
import { transcribeWithWhisper } from './whisper';
import { transcribeWithOpenAIChat } from './chat';

export const transcribeAudio = async (
  audioBlob: Blob, 
  apiKey: string, 
  model: string = 'whisper-1', 
  endpoint?: string, 
  timeout?: number
): Promise<SubtitleItem[]> => {
  logger.debug(`Starting transcription with model: ${model} on endpoint: ${endpoint || 'default'}`);
  if (model.includes('gpt-4o')) {
    return transcribeWithOpenAIChat(audioBlob, apiKey, model, endpoint, timeout);
  } else {
    return transcribeWithWhisper(audioBlob, apiKey, model, endpoint, timeout);
  }
};
```

**总行数**: ~20行

#### 14.4 创建 `src/services/api/openai/index.ts`
```typescript
export * from './whisper';
export * from './chat';
export * from './transcribe';
```

---

### 步骤 15: 提取 Gemini API 服务

#### 15.1 创建 `src/services/api/gemini/retry.ts`
**迁移内容** (从 `src/gemini.ts`):
- `generateContentWithRetry` (行 16-55, 40行)
- `isRetryableError` (行 234-266, 33行)

**代码示例:**
```typescript
// src/services/api/gemini/retry.ts
import { GoogleGenAI } from "@google/genai";
import { logger } from "@/services/utils/logger";

export async function generateContentWithRetry(
  ai: GoogleGenAI, 
  params: any, 
  retries = 3
) {
  // ... 完整实现 (40行) ...
}

export function isRetryableError(error: any): boolean {
  // ... 完整实现 (33行) ...
}
```

**总行数**: ~73行 (分两次提交，每个函数一次)

#### 15.2 创建 `src/services/api/gemini/generator.ts`
**迁移内容** (从 `src/gemini.ts`):
- `generateContentWithLongOutput` (行 73-167, 95行)

**总行数**: ~95行 (两次提交)

#### 15.3 创建 `src/services/api/gemini/schemas.ts`
**迁移内容** (从 `src/gemini.ts`):
- `REFINEMENT_SCHEMA` (行 169-196)
- `TRANSLATION_SCHEMA` (行 198-210)
- `GLOSSARY_SCHEMA` (行 211-220)
- `SAFETY_SETTINGS` (行 222-228)

**总行数**: ~60行

#### 15.4 创建 `src/services/api/gemini/index.ts`
```typescript
export * from './retry';
export * from './generator';
export * from './schemas';
```

---

### 步骤 16: 提取术语表提取器 (glossary/extractor.ts)

#### 16.1 创建 `src/services/glossary/state.ts`
**迁移内容** (从 `src/gemini.ts`):
- `GlossaryState` 类 (行 443-479, 37行)

**总行数**: ~37行

#### 16.2 创建 `src/services/glossary/extractor.ts`
**迁移内容** (从 `src/gemini.ts`):
- `extractGlossaryFromAudio` (行 270-406, 137行)
- `retryGlossaryExtraction` (行 408-435, 28行)

**代码示例:**
```typescript
// src/services/glossary/extractor.ts
import { GoogleGenAI } from "@google/genai";
import { GlossaryItem, GlossaryExtractionResult, GlossaryExtractionMetadata } from "@/types/glossary";
import { sliceAudioBuffer } from "@/services/audio/processor";
import { blobToBase64 } from "@/services/audio/converter";
import { logger } from "@/services/utils/logger";
import { mapInParallel } from "@/services/utils/concurrency";
import { generateContentWithRetry } from "@/services/api/gemini/retry";
import { GLOSSARY_SCHEMA } from "@/services/api/gemini/schemas";
import { GLOSSARY_EXTRACTION_PROMPT } from "@/prompts";

export async function extractGlossaryFromAudio(
  ai: GoogleGenAI,
  audioBuffer: AudioBuffer,
  chunks: { index: number; start: number; end: number }[],
  genre: string,
  concurrency: number,
  onProgress?: (completed: number, total: number) => void
): Promise<GlossaryExtractionResult[]> {
  // ... 完整实现 (137行) ...
}

export async function retryGlossaryExtraction(
  apiKey: string,
  audioBuffer: AudioBuffer,
  chunks: { index: number; start: number; end: number }[],
  genre: string,
  concurrency: number,
  endpoint?: string,
  timeout?: number
): Promise<GlossaryExtractionMetadata> {
  // ... 完整实现 (28行) ...
}
```

**总行数**: ~165行 (分四次提交，每次约40行)

#### 16.3 创建 `src/services/glossary/index.ts`
```typescript
export * from './crud';
export * from './merger';
export * from './selector';
export * from './state';
export * from './extractor';
```

---

### 步骤 17: 提取生成管道 (generation/pipeline.ts)

#### 17.1 创建 `src/services/generation/batch.ts`
**迁移内容** (从 `src/gemini.ts`):
- `processTranslationBatchWithRetry` (行 825-926, 102行)
- `translateBatch` (行 928-946, 19行)

**总行数**: ~121行 (分三次提交)

#### 17.2 创建 `src/services/generation/pipeline.ts`
**迁移内容** (从 `src/gemini.ts`):
- `generateSubtitles` (行 483-821, 339行)

**总行数**: ~339行 (分七次提交，每次约50行)

**重要**: 这是最大的函数，需要格外小心

#### 17.3 创建 `src/services/generation/index.ts`
```typescript
export * from './batch';
export * from './pipeline';
```

---

### 步骤 18: 更新所有导入路径

#### 18.1 更新 `src/App.tsx`
**搜索替换策略:**
```typescript
// 替换所有 utils 导入
import { ... } from './utils' 
→ 按功能拆分到:
  import { formatTime, timeToSeconds } from '@/services/subtitle/time'
  import { logger } from '@/services/utils/logger'
  等等

// 替换所有 gemini 导入
import { generateSubtitles } from './gemini'
→ import { generateSubtitles } from '@/services/generation'

// 替换所有 glossaryUtils 导入
import { createGlossary, ... } from './glossaryUtils'
→ import { createGlossary, ... } from '@/services/glossary'
```

**估计修改**: 10-15处导入语句

#### 18.2 更新 `src/GlossaryManager.tsx`
**估计修改**: 3-5处导入语句

#### 18.3 更新 `src/prompts.ts`
无需修改（只导入类型）

#### 18.4 更新 `src/consistencyValidation.ts`
**估计修改**: 1处导入语句 (`timeToSeconds`)

#### 18.5 更新 `src/terminologyChecker.ts`
**估计修改**: 1处导入语句 (`logger`)

---

### 步骤 19: 删除旧文件

#### 19.1 验证所有导入已更新
```powershell
# 搜索残留的旧导入
grep -r "from './utils'" src/
grep -r "from './gemini'" src/
grep -r "from './glossaryUtils'" src/
```

**预期结果**: 无任何匹配

#### 19.2 删除文件
```powershell
Remove-Item src/utils.ts
Remove-Item src/gemini.ts
Remove-Item src/glossaryUtils.ts
```

#### 19.3 最终验证
```powershell
npm run build
```

---

## 验证清单

### 构建验证
- [ ] `npm run build` 成功无错误
- [ ] 无 TypeScript 类型错误
- [ ] 无未使用的导入警告

### 功能验证
- [ ] 上传音频文件能正常解码
- [ ] OpenAI Whisper 转录功能正常
- [ ] Gemini 字幕生成功能正常
- [ ] 术语表提取功能正常
- [ ] 术语表管理 CRUD 正常
- [ ] 字幕导出 (SRT/ASS) 正常
- [ ] 日志输出正常

### 性能验证
- [ ] 并发处理速度未降低
- [ ] 内存使用未显著增加

---

## 回滚策略

如果任何步骤失败:

1. **立即停止**: 不要继续下一步
2. **运行构建**: `npm run build` 查看错误
3. **Git 回滚**: `git checkout .` 或 `git reset --hard HEAD`
4. **报告问题**: 向用户说明具体失败的步骤和错误信息

---

## 预估工作量

- **总步骤数**: 19个主要步骤
- **总修改行数**: ~2557行 (拆分成约60次小提交)
- **预估时间**: 每步骤5-15分钟，总计约10-15小时
- **Git 提交数**: 约60次小提交 + 1次最终整合提交

---

## 注意事项

1. **严格遵守50行规则**: 任何单次修改超过50行的，必须拆分
2. **每步独立验证**: 完成一个服务模块后立即 `npm run build`
3. **保留注释**: 迁移时保留所有 JSDoc 注释
4. **导出一致性**: 所有服务模块都通过 `index.ts` 统一导出
5. **类型导入**: 优先使用 `import type` 减少循环依赖风险
