---
name: subtitle-service
description: Subtitle parsing, generation, and translation service guidelines for Gemini-Subtitle-Pro. Use when working with SRT/ASS/VTT parsing, subtitle generation, translation pipeline, glossary management, speaker identification, and Gemini API integration. Covers the complete transcription → translation workflow.
---

# Subtitle Service Guidelines

## Purpose

Establish patterns for subtitle processing services in Gemini-Subtitle-Pro, covering parsing, generation, translation, and the AI pipeline.

## When to Use This Skill

Automatically activates when working on:

- SRT/ASS/VTT parsing and generation
- Translation pipeline
- Glossary management
- Speaker identification
- Gemini API integration for refinement
- Transcription workflow

---

## Quick Start

### Subtitle Processing Checklist

- [ ] **Parser**: Use appropriate parser for format (SRT, ASS, VTT)
- [ ] **Types**: Use `SubtitleEntry` interface consistently
- [ ] **Validation**: Validate timestamps and text content
- [ ] **Error Handling**: Handle parsing errors gracefully
- [ ] **i18n**: Support multiple languages in output

---

## Architecture Overview

### Pipeline Flow

```
Audio/Video Input
    ↓
Transcription (Whisper)
    ↓
Segmentation (VAD)
    ↓
Glossary Extraction
    ↓
Speaker Identification
    ↓
Translation/Refinement (Gemini)
    ↓
Subtitle Output (SRT/ASS/VTT)
```

### Key Services

| Service             | Location                            | Purpose                  |
| ------------------- | ----------------------------------- | ------------------------ |
| Subtitle Parser     | `src/services/subtitle/`            | Parse SRT/ASS/VTT        |
| Generation Pipeline | `src/services/generation/pipeline/` | Orchestrate workflow     |
| Gemini API          | `src/services/api/gemini/`          | Translation & refinement |
| Audio Processing    | `src/services/audio/`               | VAD, sampling            |

---

## Core Data Types

### SubtitleEntry

```typescript
interface SubtitleEntry {
  index: number;
  startTime: number; // milliseconds
  endTime: number; // milliseconds
  text: string;
  translatedText?: string;
  speaker?: string;
}
```

### Timestamp Utilities

```typescript
// Parse SRT timestamp: "00:01:23,456" → 83456
function parseSrtTimestamp(timestamp: string): number;

// Format to SRT: 83456 → "00:01:23,456"
function formatSrtTimestamp(ms: number): string;

// Parse ASS timestamp: "0:01:23.45" → 83450
function parseAssTimestamp(timestamp: string): number;
```

---

## Parsing Patterns

### SRT Parser

```typescript
export function parseSrt(content: string): SubtitleEntry[] {
  const blocks = content.trim().split(/\n\n+/);

  return blocks.map((block, index) => {
    const lines = block.split('\n');
    const timestampLine = lines[1];
    const [start, end] = timestampLine.split(' --> ');

    return {
      index,
      startTime: parseSrtTimestamp(start),
      endTime: parseSrtTimestamp(end),
      text: lines.slice(2).join('\n'),
    };
  });
}
```

### Format Detection

```typescript
export function detectSubtitleFormat(content: string): 'srt' | 'ass' | 'vtt' {
  if (content.startsWith('WEBVTT')) return 'vtt';
  if (content.includes('[Script Info]')) return 'ass';
  return 'srt';
}
```

---

## Translation Pipeline

### Concurrency Model

```typescript
// Dual semaphores for resource management
const transcriptionSemaphore = new Semaphore(
  isLocal ? 1 : 5 // Local: 1, Cloud: 5
);

const refinementSemaphore = new Semaphore(5); // Gemini Flash

// Process chunks in parallel
await mapInParallel(chunks, async (chunk) => {
  await transcriptionSemaphore.acquire();
  try {
    const transcription = await transcribe(chunk);
    // ...
  } finally {
    transcriptionSemaphore.release();
  }
});
```

---

## Resource Files

For detailed guidelines, see the resources directory:

- [parsing-patterns.md](resources/parsing-patterns.md) - Subtitle format parsing
- [pipeline-guide.md](resources/pipeline-guide.md) - Translation pipeline patterns
- [gemini-integration.md](resources/gemini-integration.md) - Gemini API usage
