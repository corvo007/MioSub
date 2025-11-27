import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold, Content, Part } from "@google/genai";
import { parseGeminiResponse, formatTime, decodeAudio, sliceAudioBuffer, transcribeAudio, timeToSeconds, blobToBase64, extractJsonArray, mapInParallel } from "./utils";
import { SubtitleItem, AppSettings, BatchOperationMode, ChunkStatus } from "./types";
import { getSystemInstruction } from "./prompts";

export const PROOFREAD_BATCH_SIZE = 20; // Default fallback

// --- RATE LIMIT HELPER ---

async function generateContentWithRetry(ai: GoogleGenAI, params: any, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await ai.models.generateContent(params);
    } catch (e: any) {
      // Check for 429 (Resource Exhausted) or 503 (Service Unavailable)
      const isRateLimit = e.status === 429 || e.message?.includes('429') || e.response?.status === 429;
      const isServerOverload = e.status === 503 || e.message?.includes('503');

      if ((isRateLimit || isServerOverload) && i < retries - 1) {
        const delay = Math.pow(2, i) * 2000 + Math.random() * 1000; // 2s, 4s, 8s + jitter
        console.warn(`Gemini API Busy (${e.status}). Retrying in ${Math.round(delay)}ms...`);
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
    let response = await generateContentWithRetry(ai, {
      model: modelName,
      contents: messages,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        systemInstruction: systemInstruction,
        safetySettings: SAFETY_SETTINGS,
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
        console.warn("JSON parse failed, attempting to continue generation...", e);

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
    console.error("Long output generation failed", e);
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

  const geminiKey = settings.geminiKey?.trim() || process.env.API_KEY || process.env.GEMINI_API_KEY;
  const openaiKey = settings.openaiKey?.trim() || process.env.OPENAI_API_KEY;

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
    throw new Error("Failed to decode audio. Please ensure the file is a valid video/audio format.");
  }

  const totalDuration = audioBuffer.duration;
  const chunkDuration = settings.chunkDuration || 300;
  const totalChunks = Math.ceil(totalDuration / chunkDuration);

  // Prepare chunks
  const chunksParams = [];
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

  const chunkResults: SubtitleItem[][] = new Array(chunksParams.length).fill([]);
  const concurrency = settings.concurrencyFlash || 5;

  // Parallel Execution (Concurrency: Flash Limit)
  await mapInParallel(chunksParams, concurrency, async (chunk, i) => {
    const { index, start, end } = chunk;

    onProgress?.({ id: index, total: totalChunks, status: 'processing', stage: 'transcribing', message: 'Transcribing...' });

    // A. Slice Audio
    const wavBlob = await sliceAudioBuffer(audioBuffer, start, end);
    const base64Audio = await blobToBase64(wavBlob);

    // B. Step 1: OpenAI Transcription
    // onProgress?.(`[Chunk ${index}] 1/3 Transcribing...`); // Too noisy in parallel
    let rawSegments: SubtitleItem[] = [];
    try {
      rawSegments = await transcribeAudio(wavBlob, openaiKey, settings.transcriptionModel);
    } catch (e: any) {
      console.warn(`Transcription warning on chunk ${index}: ${e.message}`);
      throw new Error(`Transcription failed on chunk ${index}: ${e.message}`);
    }

    // C. Step 2: Gemini Refine (2.5 Flash)
    let refinedSegments: SubtitleItem[] = [];
    if (rawSegments.length > 0) {
      onProgress?.({ id: index, total: totalChunks, status: 'processing', stage: 'refining', message: 'Refining...' });

      const refineSystemInstruction = getSystemInstruction(settings.genre, undefined, 'refinement');
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
          }
        });

        refinedSegments = parseGeminiResponse(refineResponse.text, chunkDuration);

        if (refinedSegments.length === 0) {
          refinedSegments = [...rawSegments];
        }
      } catch (e) {
        console.error(`Refinement failed for chunk ${index}, falling back to raw.`, e);
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

      const translateSystemInstruction = getSystemInstruction(settings.genre, settings.customTranslationPrompt, 'translation');
      // translateBatch is also parallelized now
      const translatedItems = await translateBatch(ai, toTranslate, translateSystemInstruction, concurrency, settings.translationBatchSize || 20);

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
    3. Check for missed translations in the source text.
    4. Remove filler words.
    
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
        }
      });

      const text = response.text || "[]";
      let translatedData: any[] = [];
      try {
        const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
        translatedData = JSON.parse(clean);
        if (!Array.isArray(translatedData) && (translatedData as any).items) translatedData = (translatedData as any).items;
      } catch (e) {
        console.warn("Translation JSON parse error");
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
      console.error("Translation batch failed", e);
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

  // Audio is required for fix_timestamps and proofread. Optional/Ignored for retranslate.
  let base64Audio = "";
  const needsAudio = mode !== 'retranslate';

  let audioOffset = 0;
  if (audioBuffer && needsAudio) {
    try {
      if (startSec < endSec) {
        // Add padding to context
        audioOffset = Math.max(0, startSec - 1);
        const blob = await sliceAudioBuffer(audioBuffer, audioOffset, Math.min(audioBuffer.duration, endSec + 1));
        base64Audio = await blobToBase64(blob);
      }
    } catch (e) {
      console.warn(`Audio slice failed for ${batchLabel}, falling back to text-only.`);
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

  if (mode === 'retranslate') {
    prompt = `
        Batch ${batchLabel}.
        RE-TRANSLATE TASK.
        Ignore timestamps. Focus on Translation Quality.
        ${specificInstruction}
        
        Instructions:
        1. Translate the "text_original" to "text_translated" accurately.
        2. **CHECK FOR MISSED TRANSLATION**: Ensure no meaning is lost.
        3. Remove filler words.
        4. Keep IDs the same.
        
        Input:
        ${JSON.stringify(payload)}
        `;
  } else if (mode === 'fix_timestamps') {
    prompt = `
        Batch ${batchLabel}.
        FIX TIMESTAMPS & ALIGNMENT TASK.
        PREVIOUS END TIME: "${lastEndTime}".
        ${specificInstruction}
        
        Instructions:
        1. Listen to audio. Align "start" and "end" perfectly.
        2. **MISSED AUDIO**: If you hear speech not in text, ADD IT.
        3. **REDISTRIBUTE**: If you find the input text is "bunched up" or compressed into a short time while the audio continues, YOU MUST SPREAD IT OUT to match the actual speech timing.
        4. **SPLIT LONG LINES**: If a segment is > 4s or > 25 chars, SPLIT IT.
        5. **LANGUAGE**: 'text_translated' MUST BE SIMPLIFIED CHINESE. Do not output English in this field.
        6. **FINAL CHECK**: Before outputting, strictly verify that ALL previous rules (1-5) have been perfectly followed. Correct any remaining errors.
        
        Input:
        ${JSON.stringify(payload)}
        `;
  } else {
    // Deep Proofread
    prompt = `
        Batch ${batchLabel}.
        DEEP PROOFREAD TASK.
        PREVIOUS END TIME: "${lastEndTime}".
        TOTAL VIDEO DURATION: ${totalVideoDuration ? formatTime(totalVideoDuration) : 'Unknown'}.
        ${specificInstruction}
        
        Instructions:
        1. Listen to the audio.
        2. **CHECK FOR MISSED HEARING/AUDIO**: Add any speech missing from text.
        3. **CHECK FOR MISSED TRANSLATION**: Fix any lost meaning.
        4. **LANGUAGE CHECK**: 'text_translated' MUST BE SIMPLIFIED CHINESE. Do not output English.
        5. **SPLIT LONG LINES**: If a segment is > 4s or > 25 chars, SPLIT IT.
        6. **FIX TIMESTAMPS**: Align to audio.
        
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
      undefined // Schema is flexible here as we parse manually or let the model decide
    );


    let processedBatch = parseGeminiResponse(text, totalVideoDuration);

    if (processedBatch.length > 0) {
      // Fix: Detect if Gemini returned relative timestamps (starting from ~0) instead of absolute
      // This happens because we sent a sliced audio file.
      if (audioOffset > 0) {
        const firstStart = timeToSeconds(processedBatch[0].startTime);
        const expectedRelativeStart = startSec - audioOffset; // Should be around 1.0s
        const expectedAbsoluteStart = startSec;

        const diffRelative = Math.abs(firstStart - expectedRelativeStart);
        const diffAbsolute = Math.abs(firstStart - expectedAbsoluteStart);

        // If the timestamp is closer to the relative start (0-based) than the absolute start,
        // we assume it's relative and add the offset.
        if (diffRelative < diffAbsolute) {
          processedBatch = processedBatch.map(item => ({
            ...item,
            startTime: formatTime(timeToSeconds(item.startTime) + audioOffset),
            endTime: formatTime(timeToSeconds(item.endTime) + audioOffset)
          }));
        }
      }

      return processedBatch;
    }
  } catch (e) {
    console.error(`Batch ${batchLabel} processing failed (${mode}).`, e);
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
  const geminiKey = settings.geminiKey?.trim() || process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error("API Key is missing.");
  const ai = new GoogleGenAI({ apiKey: geminiKey });

  let audioBuffer: AudioBuffer | null = null;
  // Retranslate doesn't strictly need audio context loaded upfront if we aren't slicing, 
  // but processBatch logic for retranslate ignores audio anyway. 
  // However, Proofread and Fix Timestamps need it.
  if (mode !== 'retranslate' && file) {
    onProgress?.({ id: 'init', total: 0, status: 'processing', message: "Loading audio..." });
    try {
      audioBuffer = await decodeAudio(file);
    } catch (e) {
      console.warn("Audio decode failed, proceeding with text-only mode.");
    }
  } else if (mode !== 'retranslate' && !file) {
    // If we are in Proofread mode but no file exists (SRT import), we fallback to text-only behavior inside processBatch (it handles null buffer)
    console.log("No media file provided, running in text-only context.");
  }

  const systemInstruction = getSystemInstruction(
    settings.genre,
    mode === 'proofread' ? settings.customProofreadingPrompt : settings.customTranslationPrompt,
    mode
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
