import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold, Content, Part } from "@google/genai";
import { ConsistencyIssue } from "./consistencyValidation";
import { parseGeminiResponse, formatTime, decodeAudio, sliceAudioBuffer, transcribeAudio, timeToSeconds, blobToBase64, extractJsonArray, mapInParallel, logger } from "./utils";
import { SubtitleItem, AppSettings, BatchOperationMode, ChunkStatus, GlossaryItem } from "./types";
import { getSystemInstruction } from "./prompts";
import { SmartSegmenter } from "./smartSegmentation";

export const PROOFREAD_BATCH_SIZE = 20; // Default fallback

// --- RATE LIMIT HELPER ---

async function generateContentWithRetry(ai: GoogleGenAI, params: any, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await ai.models.generateContent(params);
      if ((result as any).usageMetadata) {
        logger.debug("Gemini Token Usage", (result as any).usageMetadata);
      }
      return result;
    } catch (e: any) {
      // Check for 429 (Resource Exhausted) or 503 (Service Unavailable)
      const isRateLimit = e.status === 429 || e.message?.includes('429') || e.response?.status === 429;
      const isServerOverload = e.status === 503 || e.message?.includes('503');

      if ((isRateLimit || isServerOverload) && i < retries - 1) {
        const delay = Math.pow(2, i) * 2000 + Math.random() * 1000; // 2s, 4s, 8s + jitter
        logger.warn(`Gemini API Busy (${e.status}). Retrying in ${Math.round(delay)}ms...`, { attempt: i + 1, error: e.message });
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw e;
      }
    }
  }
  throw new Error("Gemini API request failed after retries.");
}

async function generateContentWithLongOutput(
  ai: GoogleGenAI,
  modelName: string,
  systemInstruction: string,
  parts: Part[],
  schema: any
): Promise<string> {
  let fullText = "";

  // Initial message structure for chat-like behavior
  // We use an array of contents to simulate history if needed
  let messages: Content[] = [
    { role: 'user', parts: parts }
  ];

  try {
    // Initial generation
    logger.debug(`Generating content with model: ${modelName}`, { systemInstruction: systemInstruction.substring(0, 100) + "..." });
    let response = await generateContentWithRetry(ai, {
      model: modelName,
      contents: messages,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        systemInstruction: systemInstruction,
        safetySettings: SAFETY_SETTINGS,
        maxOutputTokens: 65536,
      }
    });

    let text = response.text || "";
    fullText += text;

    // Check for truncation (simple heuristic: JSON parse fails)
    let attempts = 0;
    while (attempts < 3) {
      try {
        // Try to parse the current full text
        // We remove markdown code blocks first just in case
        const clean = fullText.replace(/```json/g, '').replace(/```/g, '').trim();

        // Use robust extractor to handle extra brackets/garbage
        const extracted = extractJsonArray(clean);

        if (extracted) {
          JSON.parse(extracted);
          // If parse succeeds with extracted content, we are done!
          // We should update fullText to the clean extracted version to avoid passing garbage downstream
          fullText = extracted;
          break;
        } else {
          // If extraction failed, try direct parse (maybe it's an object, or maybe it's just valid as is)
          JSON.parse(clean);
          break;
        }
      } catch (e) {
        // Parse failed, assume truncation
        logger.warn("JSON parse failed, attempting to continue generation...", { error: e.message, currentLength: fullText.length });

        // Append previous response to history
        messages.push({ role: 'model', parts: [{ text: text }] });
        // Append continue instruction
        messages.push({ role: 'user', parts: [{ text: "The output was truncated. Please continue the JSON array from exactly where you left off. Do not repeat the last complete segment." }] });

        const continueResponse = await generateContentWithRetry(ai, {
          model: modelName,
          contents: messages,
          config: {
            responseMimeType: "application/json",
            responseSchema: schema,
            systemInstruction: systemInstruction,
            safetySettings: SAFETY_SETTINGS,
            maxOutputTokens: 65536,
          }
        });

        const newText = continueResponse.text || "";
        if (!newText.trim()) break;

        // Append
        const cleanNew = newText.replace(/```json/g, '').replace(/```/g, '').trim();
        fullText += cleanNew;
        text = newText; // Update text for next iteration's history
        attempts++;
      }
    }
  } catch (e) {
    logger.error("Long output generation failed", e);
    throw e;
  }

  return fullText;
}

// --- SCHEMAS ---

const REFINEMENT_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      start: { type: Type.STRING, description: "HH:MM:SS,mmm" },
      end: { type: Type.STRING, description: "HH:MM:SS,mmm" },
      text: { type: Type.STRING, description: "Corrected original text" },
    },
    required: ["start", "end", "text"],
  },
};

const TRANSLATION_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.INTEGER },
      text_original: { type: Type.STRING },
      text_translated: { type: Type.STRING, description: "Simplified Chinese translation" },
    },
    required: ["id", "text_translated"],
  },
};

const BATCH_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.INTEGER },
      start: { type: Type.STRING, description: "HH:MM:SS,mmm" },
      end: { type: Type.STRING, description: "HH:MM:SS,mmm" },
      text_original: { type: Type.STRING },
      text_translated: { type: Type.STRING, description: "Simplified Chinese translation" },
    },
    required: ["id", "start", "end", "text_original", "text_translated"],
  },
};

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// --- MAIN FUNCTIONS ---

export const generateSubtitles = async (
  file: File,
  duration: number,
  settings: AppSettings,
  onProgress?: (update: ChunkStatus) => void,
  onIntermediateResult?: (subs: SubtitleItem[]) => void
): Promise<SubtitleItem[]> => {

  const geminiKey = (typeof window !== 'undefined' ? (window as any).env?.GEMINI_API_KEY : undefined) || settings.geminiKey?.trim() || process.env.API_KEY || process.env.GEMINI_API_KEY;
  const openaiKey = (typeof window !== 'undefined' ? (window as any).env?.OPENAI_API_KEY : undefined) || settings.openaiKey?.trim() || process.env.OPENAI_API_KEY;

  if (!geminiKey) throw new Error("Gemini API Key is missing.");
  if (!openaiKey) throw new Error("OpenAI API Key is missing.");

  const ai = new GoogleGenAI({ apiKey: geminiKey });

  // 1. Decode Audio
  onProgress?.({ id: 'init', total: 0, status: 'processing', message: "Decoding audio track..." });
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await decodeAudio(file);
    onProgress?.({ id: 'init', total: 0, status: 'completed', message: `Audio decoded. Duration: ${formatTime(audioBuffer.duration)}` });
  } catch (e) {
    logger.error("Failed to decode audio", e);
    throw new Error("Failed to decode audio. Please ensure the file is a valid video/audio format.");
  }

  const totalDuration = audioBuffer.duration;
  const chunkDuration = settings.chunkDuration || 300;
  const totalChunks = Math.ceil(totalDuration / chunkDuration);

  // Prepare chunks
  const chunksParams = [];

  if (settings.useSmartSplit) {
    onProgress?.({ id: 'init', total: 0, status: 'processing', message: "Analyzing audio for smart segmentation..." });
    const segmenter = new SmartSegmenter();
    const segments = await segmenter.segmentAudio(audioBuffer, chunkDuration);
    logger.info("Smart Segmentation Results", { count: segments.length, segments });

    segments.forEach((seg, i) => {
      chunksParams.push({
        index: i + 1,
        start: seg.start,
        end: seg.end
      });
    });
    onProgress?.({ id: 'init', total: 0, status: 'completed', message: `Smart split created ${segments.length} chunks.` });
  } else {
    // Standard fixed-size chunking
    let cursor = 0;
    for (let i = 0; i < totalChunks; i++) {
      const end = Math.min(cursor + chunkDuration, totalDuration);
      chunksParams.push({
        index: i + 1,
        start: cursor,
        end: end
      });
      cursor += chunkDuration;
    }
    logger.info("Fixed Segmentation Results", { count: chunksParams.length, chunks: chunksParams });
  }

  const chunkResults: SubtitleItem[][] = new Array(chunksParams.length).fill([]);
  const concurrency = settings.concurrencyFlash || 5;

  // Parallel Execution (Concurrency: Flash Limit)
  await mapInParallel(chunksParams, concurrency, async (chunk, i) => {
    const { index, start, end } = chunk;

    onProgress?.({ id: index, total: totalChunks, status: 'processing', stage: 'transcribing', message: 'Transcribing...' });
    logger.debug(`[Chunk ${index}] Processing started. Range: ${start}-${end}`);

    // A. Slice Audio
    const wavBlob = await sliceAudioBuffer(audioBuffer, start, end);
    const base64Audio = await blobToBase64(wavBlob);

    // B. Step 1: OpenAI Transcription
    // onProgress?.(`[Chunk ${index}] 1/3 Transcribing...`); // Too noisy in parallel
    let rawSegments: SubtitleItem[] = [];
    try {
      rawSegments = await transcribeAudio(wavBlob, openaiKey, settings.transcriptionModel);
      logger.debug(`[Chunk ${index}] Transcription complete. Segments: ${rawSegments.length}`);
    } catch (e: any) {
      logger.warn(`Transcription warning on chunk ${index}: ${e.message}`);
      throw new Error(`Transcription failed on chunk ${index}: ${e.message}`);
    }

    // C. Step 2: Gemini Refine (2.5 Flash)
    let refinedSegments: SubtitleItem[] = [];
    if (rawSegments.length > 0) {
      onProgress?.({ id: index, total: totalChunks, status: 'processing', stage: 'refining', message: 'Refining...' });

      const refineSystemInstruction = getSystemInstruction(settings.genre, undefined, 'refinement', settings.glossary);
      const refinePrompt = `
        Refine this raw transcription based on the attached audio.
        Raw Transcription: ${JSON.stringify(rawSegments.map(s => ({ start: s.startTime, end: s.endTime, text: s.original })))}
        `;

      try {
        const refineResponse = await generateContentWithRetry(ai, {
          model: 'gemini-2.5-flash',
          contents: {
            parts: [
              { inlineData: { mimeType: "audio/wav", data: base64Audio } },
              { text: refinePrompt }
            ]
          },
          config: {
            responseMimeType: "application/json",
            responseSchema: REFINEMENT_SCHEMA,
            systemInstruction: refineSystemInstruction,
            safetySettings: SAFETY_SETTINGS,
            maxOutputTokens: 65536,
          }
        });

        refinedSegments = parseGeminiResponse(refineResponse.text, chunkDuration);

        if (refinedSegments.length === 0) {
          refinedSegments = [...rawSegments];
        }
        logger.debug(`[Chunk ${index}] Refinement complete. Segments: ${refinedSegments.length}`);
      }
      catch (e) {
        logger.error(`Refinement failed for chunk ${index}, falling back to raw.`, e);
        refinedSegments = [...rawSegments];
      }
    }

    // D. Step 3: Gemini Translate (2.5 Flash)
    let finalChunkSubs: SubtitleItem[] = [];
    if (refinedSegments.length > 0) {
      onProgress?.({ id: index, total: totalChunks, status: 'processing', stage: 'translating', message: 'Translating...' });

      const toTranslate = refinedSegments.map((seg, idx) => ({
        id: idx + 1,
        original: seg.original,
        start: seg.startTime,
        end: seg.endTime
      }));

      const translateSystemInstruction = getSystemInstruction(settings.genre, settings.customTranslationPrompt, 'translation', settings.glossary);
      // translateBatch is also parallelized now
      logger.debug(`[Chunk ${index}] Starting translation of ${toTranslate.length} items`);
      const translatedItems = await translateBatch(ai, toTranslate, translateSystemInstruction, concurrency, settings.translationBatchSize || 20);
      logger.debug(`[Chunk ${index}] Translation complete. Items: ${translatedItems.length}`);

      finalChunkSubs = translatedItems.map(item => ({
        id: 0, // Placeholder, will re-index later
        startTime: formatTime(timeToSeconds(item.start) + start),
        endTime: formatTime(timeToSeconds(item.end) + start),
        original: item.original,
        translated: item.translated
      }));
    }

    chunkResults[i] = finalChunkSubs;

    // Update Intermediate Result
    // We flatten and re-index everything so far
    const currentAll = chunkResults.flat().map((s, idx) => ({ ...s, id: idx + 1 }));
    onIntermediateResult?.(currentAll);

    onProgress?.({ id: index, total: totalChunks, status: 'completed', message: 'Done' });
  });

  return chunkResults.flat().map((s, idx) => ({ ...s, id: idx + 1 }));
};

// --- HELPERS ---

async function translateBatch(ai: GoogleGenAI, items: any[], systemInstruction: string, concurrency: number, batchSize: number): Promise<any[]> {
  const batches: any[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }

  const batchResults = await mapInParallel(batches, concurrency, async (batch) => {
    const payload = batch.map(item => ({ id: item.id, text: item.original }));

    const prompt = `Task: Translate the following ${batch.length} items to Simplified Chinese.
    
    STRICT RULES:
    1. Output exactly ${batch.length} items. One-to-one mapping with input IDs.
    2. ID matching is critical. Do not skip any ID.
    3. **CHECK FOR MISSED TRANSLATION**: Ensure no meaning is lost from source text.
    4. **REMOVE FILLER WORDS**: Ignore stuttering and filler words.
    5. **LANGUAGE**: 'text_translated' MUST BE SIMPLIFIED CHINESE.
    6. **FINAL CHECK**: Verify all IDs match and translation is complete before outputting.
    
    Input JSON:
    ${JSON.stringify(payload)}`;

    try {
      const response = await generateContentWithRetry(ai, {
        model: 'gemini-2.5-flash',
        contents: { parts: [{ text: prompt }] },
        config: {
          responseMimeType: "application/json",
          responseSchema: TRANSLATION_SCHEMA,
          systemInstruction: systemInstruction,
          safetySettings: SAFETY_SETTINGS,
          maxOutputTokens: 65536,
        }
      });

      const text = response.text || "[]";
      let translatedData: any[] = [];
      try {
        const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
        translatedData = JSON.parse(clean);
        if (!Array.isArray(translatedData) && (translatedData as any).items) translatedData = (translatedData as any).items;
      } catch (e) {
        logger.warn("Translation JSON parse error");
      }

      const transMap = new Map(translatedData.map((t: any) => [t.id, t.text_translated]));

      return batch.map(item => {
        const translatedText = transMap.get(item.id);
        return {
          ...item,
          translated: (translatedText && translatedText.trim().length > 0) ? translatedText : item.original
        };
      });

    } catch (e) {
      logger.error("Translation batch failed", e);
      return batch.map(item => ({ ...item, translated: item.original }));
    }
  });

  return batchResults.flat();
}

// --- CORE BATCH PROCESSING LOGIC ---

async function processBatch(
  ai: GoogleGenAI,
  batch: SubtitleItem[],
  audioBuffer: AudioBuffer | null,
  lastEndTime: string,
  settings: AppSettings,
  systemInstruction: string,
  batchLabel: string,
  totalVideoDuration?: number,
  mode: BatchOperationMode = 'proofread',
  batchComment?: string
): Promise<SubtitleItem[]> {
  if (batch.length === 0) return [];

  const batchStartStr = batch[0].startTime;
  const batchEndStr = batch[batch.length - 1].endTime;
  const startSec = timeToSeconds(batchStartStr);
  const endSec = timeToSeconds(batchEndStr);

  // Audio is required for both fix_timestamps and proofread modes.
  let base64Audio = "";

  let audioOffset = 0;
  if (audioBuffer) {
    try {
      if (startSec < endSec) {
        // Add padding to context (5 seconds before and after)
        audioOffset = Math.max(0, startSec - 5);
        const blob = await sliceAudioBuffer(audioBuffer, audioOffset, Math.min(audioBuffer.duration, endSec + 5));
        base64Audio = await blobToBase64(blob);
      }
    } catch (e) {
      logger.warn(`Audio slice failed for ${batchLabel}, falling back to text-only.`);
    }
  }

  const payload = batch.map(s => ({
    id: s.id,
    start: s.startTime,
    end: s.endTime,
    text_original: s.original,
    text_translated: s.translated,
    comment: s.comment // Include user comment
  }));

  let prompt = "";
  const hasBatchComment = batchComment && batchComment.trim().length > 0;
  const hasLineComments = batch.some(s => s.comment && s.comment.trim().length > 0);

  let specificInstruction = "";

  if (hasLineComments && !hasBatchComment) {
    // Case 1: Line Comments Only
    specificInstruction = `
    USER LINE INSTRUCTIONS:
    1. Specific lines have "comment" fields. You MUST strictly follow these manual corrections.
    2. CRITICAL: For lines WITHOUT comments, DO NOT MODIFY THEM. Preserve them exactly as is. Only change lines with comments.
    `;
  } else if (hasLineComments && hasBatchComment) {
    // Case 2: Line Comments AND Batch Comment
    specificInstruction = `
    USER INSTRUCTIONS:
    1. First, address the specific "comment" fields on individual lines.
    2. Second, apply this GLOBAL BATCH INSTRUCTION to the whole segment: "${batchComment}".
    3. You may modify any line to satisfy the global instruction or specific comments.
    `;
  } else if (hasBatchComment && !hasLineComments) {
    // Case 3: Batch Comment Only
    specificInstruction = `
    USER BATCH INSTRUCTION (Apply to ALL lines in this batch): "${batchComment}"
    `;
  }
  // Case 4: No Comments -> Default behavior (prompt below covers it)

  if (mode === 'fix_timestamps') {
    prompt = `
    Batch ${batchLabel}.
    TIMESTAMP ALIGNMENT & SEGMENTATION TASK
    Previous batch ended at: "${lastEndTime}"
    ${specificInstruction}

    TASK RULES (Priority Order):
    
    [P1 - PRIMARY] Perfect Timestamp Alignment
    → Listen to audio carefully
    → Align "start" and "end" to actual speech boundaries in audio
    → Timestamps MUST be relative to provided audio file (starting at 00:00:00)
    → Fix bunched-up or spread-out timing issues
    
    [P2 - MANDATORY] Segment Splitting for Readability
    → SPLIT any segment >4 seconds OR >25 Chinese characters
    → When splitting: distribute timing based on actual audio speech
    → Ensure splits occur at natural speech breaks
    
    [P3 - CONTENT] Audio Verification
    → If you hear speech NOT in the text → ADD new subtitle entries
    → Remove filler words from 'text_original' (uh, um, 呃, 嗯, etc.)
    
    [P4 - ABSOLUTE] Translation Preservation
    → DO NOT modify 'text_translated' under ANY circumstances
    → Even if it's English, wrong, or nonsensical → LEAVE IT
    → Translation is handled by Proofread function, not here
    
    FINAL VERIFICATION:
    ✓ All timestamps aligned to audio
    ✓ Long segments split appropriately  
    ✓ No missed speech
    ✓ 'text_translated' completely unchanged

    Input JSON:
    ${JSON.stringify(payload)}
        `;
  } else {
    // Proofread - Focus on TRANSLATION quality, may adjust timing when necessary
    prompt = `
    Batch ${batchLabel}.
    TRANSLATION QUALITY IMPROVEMENT TASK
    Previous batch ended at: "${lastEndTime}"
    Total video duration: ${totalVideoDuration ? formatTime(totalVideoDuration) : 'Unknown'}
    ${specificInstruction}

    TASK RULES (Priority Order):
    
    [P1 - PRIMARY] Translation Quality Excellence
    → Fix mistranslations and missed meanings
    → Improve awkward or unnatural Chinese phrasing
    → Ensure ALL 'text_translated' are fluent Simplified Chinese (never English/Japanese/etc.)
    → Verify translation captures full intent of 'text_original'
    
    [P2 - CONTENT] Audio Content Verification
    → Listen to audio carefully
    → If you hear speech NOT in subtitles → ADD new subtitle entries
    → Verify 'text_original' matches what was actually said
    
    [P3 - SUPPORTING] Timestamp Adjustments (When Needed)
    → You MAY adjust timestamps to support better translation
    → Example: merging/splitting segments for more natural translation flow
    → Keep timestamps within provided audio range (00:00:00 to audio end)
    → Ensure start < end for all segments
    
    [P4 - PRESERVATION] Default Behavior
    → For subtitles WITHOUT issues: preserve them as-is
    → Only modify when there's a clear translation quality problem
    
    FINAL VERIFICATION:
    ✓ All 'text_translated' are fluent Simplified Chinese
    ✓ No missed meaning from 'text_original'
    ✓ No missed speech from audio
    ✓ Translation quality significantly improved

    Current Subtitles JSON:
    ${JSON.stringify(payload)}
        `;
  }

  try {
    const parts: Part[] = [{ text: prompt }];
    if (base64Audio) {
      parts.push({
        inlineData: {
          mimeType: "audio/wav",
          data: base64Audio
        }
      });
    }

    // Model Selection:
    // Proofread -> Gemini 3 Pro (Best quality)
    // Fix Timestamps / Retranslate -> Gemini 2.5 Flash (Fast/Efficient)
    const model = mode === 'proofread' ? 'gemini-3-pro-preview' : 'gemini-2.5-flash';

    // Use the new Long Output handler
    const text = await generateContentWithLongOutput(
      ai,
      model,
      systemInstruction,
      parts,
      BATCH_SCHEMA // Use the new schema
    );


    let processedBatch = parseGeminiResponse(text, totalVideoDuration);

    if (processedBatch.length > 0) {
      // Since we requested relative timestamps (from 00:00:00) in the prompt,
      // and we provided a sliced audio file, the timestamps returned are relative to the slice.
      // We MUST add the audioOffset to convert them back to absolute video time.
      if (audioOffset > 0) {
        processedBatch = processedBatch.map(item => ({
          ...item,
          startTime: formatTime(timeToSeconds(item.startTime) + audioOffset),
          endTime: formatTime(timeToSeconds(item.endTime) + audioOffset)
        }));
      }

      return processedBatch;
    }
  } catch (e) {
    logger.error(`Batch ${batchLabel} processing failed (${mode}).`, e);
  }
  // Fallback: return original batch
  return batch;
}

// --- BATCH EXECUTION ---

export const runBatchOperation = async (
  file: File | null,
  allSubtitles: SubtitleItem[],
  batchIndices: number[], // 0-based indices of chunks
  settings: AppSettings,
  mode: BatchOperationMode,
  batchComments: Record<number, string> = {}, // Pass map of batch index -> comment
  onProgress?: (update: ChunkStatus) => void
): Promise<SubtitleItem[]> => {
  const geminiKey = (typeof window !== 'undefined' ? (window as any).env?.GEMINI_API_KEY : undefined) || settings.geminiKey?.trim() || process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error("API Key is missing.");
  const ai = new GoogleGenAI({ apiKey: geminiKey });

  let audioBuffer: AudioBuffer | null = null;
  // Both Proofread and Fix Timestamps need audio context.
  if (file) {
    onProgress?.({ id: 'init', total: 0, status: 'processing', message: "Loading audio..." });
    try {
      audioBuffer = await decodeAudio(file);
    } catch (e) {
      logger.warn("Audio decode failed, proceeding with text-only mode.", e);
    }
  } else {
    // If we are in Proofread mode but no file exists (SRT import), we fallback to text-only behavior inside processBatch (it handles null buffer)
    logger.info("No media file provided, running in text-only context.");
  }

  const systemInstruction = getSystemInstruction(
    settings.genre,
    mode === 'proofread' ? settings.customProofreadingPrompt : settings.customTranslationPrompt,
    mode,
    settings.glossary
  );

  const currentSubtitles = [...allSubtitles];
  const chunks: SubtitleItem[][] = [];
  const batchSize = settings.proofreadBatchSize || PROOFREAD_BATCH_SIZE;
  for (let i = 0; i < currentSubtitles.length; i += batchSize) {
    chunks.push(currentSubtitles.slice(i, i + batchSize));
  }

  const sortedIndices = [...batchIndices].sort((a, b) => a - b);

  // Group consecutive indices
  const groups: number[][] = [];

  // Exception: If ALL batches are selected, do NOT group them. Process individually.
  // This prevents sending the entire movie as one huge prompt which would definitely fail.
  const isSelectAll = sortedIndices.length === chunks.length;

  if (sortedIndices.length > 0) {
    if (isSelectAll) {
      // 1-on-1 mapping
      sortedIndices.forEach(idx => groups.push([idx]));
    } else {
      // Consecutive grouping logic
      let currentGroup = [sortedIndices[0]];
      for (let i = 1; i < sortedIndices.length; i++) {
        if (sortedIndices[i] === sortedIndices[i - 1] + 1) {
          currentGroup.push(sortedIndices[i]);
        } else {
          groups.push(currentGroup);
          currentGroup = [sortedIndices[i]];
        }
      }
      groups.push(currentGroup);
    }
  }

  // Determine concurrency based on mode
  // Proofread uses Gemini 3 Pro (Low RPM) -> Concurrency PRO
  // Others use Gemini 2.5 Flash (High RPM) -> Concurrency FLASH
  const concurrency = mode === 'proofread' ? (settings.concurrencyPro || 2) : (settings.concurrencyFlash || 5);

  await mapInParallel(groups, concurrency, async (group, i) => {
    const firstBatchIdx = group[0];

    // Merge batches in the group
    let mergedBatch: SubtitleItem[] = [];
    let mergedComment = "";

    group.forEach(idx => {
      if (idx < chunks.length) {
        const batch = chunks[idx];
        mergedBatch = [...mergedBatch, ...batch];

        if (batchComments[idx] && batch.length > 0) {
          const rangeLabel = `[IDs ${batch[0].id}-${batch[batch.length - 1].id}]`;
          mergedComment += (mergedComment ? " | " : "") + `${rangeLabel}: ${batchComments[idx]}`;
        }
      }
    });

    // Context for timestamps
    let lastEndTime = "00:00:00,000";
    if (firstBatchIdx > 0) {
      const prevChunk = chunks[firstBatchIdx - 1];
      if (prevChunk.length > 0) {
        lastEndTime = prevChunk[prevChunk.length - 1].endTime;
      }
    }

    let actionLabel = "";
    if (mode === 'proofread') actionLabel = "Polishing";
    else if (mode === 'fix_timestamps') actionLabel = "Aligning";
    else actionLabel = "Translating";

    const groupLabel = group.length > 1 ? `${group[0] + 1}-${group[group.length - 1] + 1}` : `${firstBatchIdx + 1}`;
    onProgress?.({ id: groupLabel, total: groups.length, status: 'processing', message: `${actionLabel}...` });
    logger.debug(`[Batch ${groupLabel}] Starting ${mode} operation. Merged items: ${mergedBatch.length}`);

    const processed = await processBatch(
      ai,
      mergedBatch,
      audioBuffer,
      lastEndTime,
      settings,
      systemInstruction,
      groupLabel,
      audioBuffer?.duration,
      mode,
      mergedComment
    );
    logger.debug(`[Batch ${groupLabel}] Operation complete. Result items: ${processed.length}`);

    if (processed.length > 0) {
      chunks[firstBatchIdx] = processed;
      for (let j = 1; j < group.length; j++) {
        chunks[group[j]] = [];
      }
    }
    onProgress?.({ id: groupLabel, total: groups.length, status: 'completed', message: 'Done' });
  });

  return chunks.flat().map((s, i) => ({ ...s, id: i + 1 }));
};

/**
 * Auto-generate a glossary from the current subtitles.
 * Uses Gemini to identify key terms, names, and specialized vocabulary.
 */
export const generateGlossary = async (
  subtitles: SubtitleItem[],
  apiKey: string,
  genre: string
): Promise<GlossaryItem[]> => {
  if (!apiKey) throw new Error("Gemini API Key is missing.");
  const ai = new GoogleGenAI({ apiKey });

  // Prepare a sample of the text to avoid context limit issues if the file is huge.
  // We'll take the first 200 lines, middle 100, and last 100 to get a good spread.
  let textSample = "";
  // Gemini context window is large (1M+ tokens), so we can process most subtitle files entirely.
  // We only sample if the file is extremely large (> 10,000 lines) to avoid timeouts.
  if (subtitles.length > 10000) {
    const start = subtitles.slice(0, 2000);
    const midIdx = Math.floor(subtitles.length / 2);
    const mid = subtitles.slice(midIdx, midIdx + 2000);
    const end = subtitles.slice(-2000);
    textSample = [...start, ...mid, ...end].map(s => s.original).join("\n");
  } else {
    textSample = subtitles.map(s => s.original).join("\n");
  }

  const prompt = `
    Task: Extract a glossary of key terms from the subtitle text.

      Context / Genre: ${genre}

    FOCUS AREAS:
    1. **Proper Names**: People, places, organizations.
    2. **Specialized Terminology**: Terms specific to this genre/context.
    3. **Recurring Terms**: Technical terms or slang appearing multiple times.

      RULES:
    1. **DEDUPLICATION**: Only list each unique term once. If a term appears multiple times, include it only once.
    2. **SIMPLIFIED CHINESE**: All translations MUST BE in Simplified Chinese (zh-CN).
    3. **RELEVANCE**: Only include terms important for consistent translation (not common words).
    4. **NOTES**: Use the "notes" field to clarify context if the term is ambiguous.
    5. **FINAL CHECK**: Verify all terms are unique, relevant, and translations are accurate.

    Text Sample:
    ${textSample}
    `;

  const schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        term: { type: Type.STRING },
        translation: { type: Type.STRING },
        notes: { type: Type.STRING }
      },
      required: ["term", "translation"]
    }
  };

  try {
    const response = await generateContentWithRetry(ai, {
      model: 'gemini-2.5-flash',
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.3,
        maxOutputTokens: 65536,
      }
    });

    const text = response.text;
    if (!text) return [];
    return JSON.parse(text) as GlossaryItem[];
  } catch (e) {
    logger.error("Failed to generate glossary:", e);
    throw new Error("Failed to generate glossary. Please try again.");
  }
};

export const checkGlobalConsistency = async (
  subtitles: SubtitleItem[],
  apiKey: string,
  genre: string
): Promise<ConsistencyIssue[]> => {
  if (!apiKey) throw new Error("Gemini API Key is missing.");
  const ai = new GoogleGenAI({ apiKey });

  // Prepare a sample of the text
  let textSample = "";
  if (subtitles.length > 500) {
    const start = subtitles.slice(0, 200);
    const midIdx = Math.floor(subtitles.length / 2);
    const mid = subtitles.slice(midIdx, midIdx + 100);
    const end = subtitles.slice(-100);
    textSample = [...start, ...mid, ...end].map(s => s.translated).join("\n");
  } else {
    textSample = subtitles.map(s => s.translated).join("\n");
  }

  const prompt = `
    Task: Analyze translated subtitle text for GLOBAL CONSISTENCY issues.

      Context / Genre: ${genre}

    FOCUS AREAS:
    1. **Term Consistency**: Same name/term translated differently.
       Example: "John" as "约翰" in one place, "强" in another.
    2. **Tone Consistency**: Sudden shifts in formality or speaking style without context.
    3. **Style Consistency**: Mixing different translation approaches.

    SEVERITY GUIDELINES:
    - **high**: Same proper noun translated 2+ different ways, major tone shifts.
    - **medium**: Minor terminology inconsistencies, slight style variations.
    - **low**: Trivial word choice differences that don't affect comprehension.

    RULES:
    1. **BE PRECISE**: Only report ACTUAL inconsistencies, not normal stylistic variation.
    2. **PROVIDE EXAMPLES**: Include the conflicting terms/phrases in the description.
    3. **SET TYPE**: Always use "ai_consistency" as the type.
    4. **FINAL CHECK**: Verify each reported issue is a real inconsistency before including it.

    Text Sample (${subtitles.length} segments):
    ${textSample}
    `;

  const schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        type: { type: Type.STRING },
        segmentId: { type: Type.INTEGER },
        description: { type: Type.STRING },
        severity: { type: Type.STRING }
      },
      required: ["type", "description", "severity"]
    }
  };

  try {
    const response = await generateContentWithRetry(ai, {
      model: 'gemini-2.5-flash',
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.3,
        maxOutputTokens: 65536,
      }
    });

    const text = response.text;
    if (!text) return [];
    return JSON.parse(text) as ConsistencyIssue[];
  } catch (e) {
    logger.error("Failed to check consistency:", e);
    return [];
  }
};
