
import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { parseGeminiResponse, formatTime, decodeAudio, sliceAudioBuffer, transcribeAudio, timeToSeconds, blobToBase64 } from "./utils";
import { SubtitleItem, AppSettings, Genre, BatchOperationMode } from "./types";

export const PROOFREAD_BATCH_SIZE = 20;
const TRANSLATION_BATCH_SIZE = 10; // Reduced from 20 to improve stability
const PROCESSING_CHUNK_DURATION = 300; // 5 minutes chunk

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

// --- PROMPT GENERATORS ---

const getSystemInstruction = (
  genre: string,
  customPrompt: string | undefined,
  mode: 'refinement' | 'translation' | 'proofread' | 'fix_timestamps' | 'retranslate' = 'translation'
): string => {

  // If custom prompt is provided, usually we prepend/mix it, but for simplicity if a user overrides "Proofreading Prompt", we use it for "Deep Proofread" mode.
  if (mode === 'proofread' && customPrompt && customPrompt.trim().length > 0) {
    return customPrompt;
  }
  // We allow custom prompt override for translation phase too
  if (mode === 'translation' && customPrompt && customPrompt.trim().length > 0) {
    return customPrompt;
  }

  // 1. Refinement Prompt (Flash 2.5) - Initial Pass
  if (mode === 'refinement') {
    return `You are a professional Subtitle QA Specialist. 
    You will receive an audio chunk and a raw JSON transcription.
    
    YOUR TASKS:
    1. Listen to the audio to verify the transcription.
    2. **CHECK FOR MISSED HEARING**: If there is speech in the audio that is MISSING from the transcription, you MUST ADD IT.
    3. FIX TIMESTAMPS: Ensure start/end times match the audio speech perfectly. **Timestamps MUST be strictly within the provided audio duration.**
    4. FIX TRANSCRIPTION: Correct mishearings, typos, and proper nouns (names, terminology).
    5. IGNORE FILLERS: Do not transcribe stuttering or meaningless filler words (uh, um, ah, eto, ano, 呃, 那个).
    6. SPLIT LINES: STRICT RULE. If a segment is longer than 4 seconds or > 25 characters, YOU MUST SPLIT IT into shorter, natural segments.
    7. FORMAT: Return a valid JSON array.
    
    Genre Context: ${genre}`;
  }

  // 2. Translation Prompt (Flash 2.5) - Initial Pass & Re-translate
  if (mode === 'translation' || mode === 'retranslate') {
    let genreContext = "";
    switch (genre) {
      case 'anime': genreContext = "Genre: Anime. Use casual, emotive tone. Preserve honorifics nuances."; break;
      case 'movie': genreContext = "Genre: Movie/TV. Natural dialogue, concise, easy to read."; break;
      case 'news': genreContext = "Genre: News. Formal, objective, standard terminology."; break;
      case 'tech': genreContext = "Genre: Tech. Precise terminology. Keep standard English acronyms."; break;
      case 'general': genreContext = "Genre: General. Neutral and accurate."; break;
      default: genreContext = `Context: ${genre}. Translate using tone/terminology appropriate for this context.`; break;
    }

    return `You are a professional translator. Translate subtitles to Simplified Chinese (zh-CN).
    RULES:
    1. **CHECK FOR MISSED TRANSLATION**: Ensure every meaningful part of the original text is translated.
    2. **REMOVE FILLER WORDS**: Completely ignore stuttering, hesitation, and filler words (e.g., "uh", "um", "ah", "eto", "ano", "呃", "这个", "那个").
    3. The translation must be fluent written Chinese, not a literal transcription of broken speech.
    4. Maintain the "id" exactly.
    ${genreContext}`;
  }

  // 3. Fix Timestamps Prompt (Flash 2.5)
  if (mode === 'fix_timestamps') {
    return `You are a Subtitle Timing Specialist. 
      Your goal is to align timestamps and fix transcription gaps using the audio.
      
      RULES:
      1. **ALIGNMENT**: Adjust start/end times to match the audio perfectly.
      2. **SPLITTING**: STRICTLY SPLIT any segment longer than 4 seconds or > 25 Chinese characters. This is critical for readability.
      3. **MISSED AUDIO**: If the audio contains speech that is NOT in the text, transcribe it and insert it.
      4. **LANGUAGE SAFETY**: The 'text_translated' field MUST BE SIMPLIFIED CHINESE. Do not output English in this field.
      5. **NO TRANSLATION CHANGE**: Do not change the Chinese translation unless it is completely wrong or missing.
      6. **NO FILLERS**: Remove filler words from the original text.
      7. **STRICT TIMING**: Timestamps must not exceed the audio duration.
      
      Context: ${genre}`;
  }

  // 4. Deep Proofreading Prompt (Pro 3)
  return `You are an expert Subtitle Quality Assurance Specialist using Gemini 3 Pro.
    Your goal is to perfect the subtitles.
    
    CRITICAL INSTRUCTIONS:
    1. **MISSED CONTENT**: Check for any speech in the audio that was missed in the text. ADD IT if found.
    2. **MISSED TRANSLATION**: Check if the current translation missed any meaning from the original. Fix it.
    3. **LANGUAGE SAFETY**: The 'text_translated' field MUST BE SIMPLIFIED CHINESE. If the audio is English, the translation MUST be Chinese. NEVER output English in the translated field.
    4. **SPLITTING**: STRICTLY SPLIT any segment longer than 4 seconds or > 25 Chinese characters. This is the most important rule for readability.
    5. **REMOVE FILLER WORDS**: Delete any remaining filler words (e.g., 呃, 嗯, 啊, eto, ano) that disrupt flow.
    6. **FIX TIMESTAMPS**: Ensure they are strictly within the audio range. 
    7. **FLUENCY**: Ensure the Chinese translation is natural and culturally appropriate for: ${genre}.
    8. **USER COMMENTS**: If a "comment" field is present in the input for a specific line, YOU MUST ADDRESS IT. This is a manual correction request.
    9. **PRESERVATION**: If specific lines have comments, fix those. For lines WITHOUT comments, preserve them unless there is a glaring error or the batch has a global instruction.
    10. Return valid JSON matching input structure.`;
};

// --- MAIN FUNCTIONS ---

export const generateSubtitles = async (
  file: File,
  duration: number,
  settings: AppSettings,
  onProgress?: (msg: string) => void,
  onIntermediateResult?: (subs: SubtitleItem[]) => void
): Promise<SubtitleItem[]> => {

  const geminiKey = settings.geminiKey?.trim() || process.env.API_KEY || process.env.GEMINI_API_KEY;
  const openaiKey = settings.openaiKey?.trim() || process.env.OPENAI_API_KEY;

  if (!geminiKey) throw new Error("Gemini API Key is missing.");
  if (!openaiKey) throw new Error("OpenAI API Key is missing.");

  const ai = new GoogleGenAI({ apiKey: geminiKey });

  // 1. Decode Audio
  onProgress?.("Decoding audio track...");
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await decodeAudio(file);
    onProgress?.(`Audio decoded. Duration: ${formatTime(audioBuffer.duration)}`);
  } catch (e) {
    throw new Error("Failed to decode audio. Please ensure the file is a valid video/audio format.");
  }

  const totalDuration = audioBuffer.duration;
  let cursor = 0;
  let chunkIndex = 1;
  const totalChunks = Math.ceil(totalDuration / PROCESSING_CHUNK_DURATION);
  let allSubtitles: SubtitleItem[] = [];
  let globalIdCounter = 1;

  // 2. Pipeline Loop
  while (cursor < totalDuration) {
    const end = Math.min(cursor + PROCESSING_CHUNK_DURATION, totalDuration);
    onProgress?.(`Processing Chunk ${chunkIndex}/${totalChunks} (${formatTime(cursor)} - ${formatTime(end)})...`);

    // A. Slice Audio
    const wavBlob = await sliceAudioBuffer(audioBuffer, cursor, end);
    const base64Audio = await blobToBase64(wavBlob);

    // B. Step 1: OpenAI Transcription
    onProgress?.(`[Chunk ${chunkIndex}] 1/3 Transcribing (${settings.transcriptionModel})...`);
    let rawSegments: SubtitleItem[] = [];
    try {
      rawSegments = await transcribeAudio(wavBlob, openaiKey, settings.transcriptionModel);
    } catch (e: any) {
      console.warn(`Transcription warning on chunk ${chunkIndex}: ${e.message}`);
      throw new Error(`Transcription failed on chunk ${chunkIndex}: ${e.message}`);
    }

    // C. Step 2: Gemini Refine (2.5 Flash)
    let refinedSegments: SubtitleItem[] = [];
    if (rawSegments.length > 0) {
      onProgress?.(`[Chunk ${chunkIndex}] 2/3 Refining (Audio-Grounded)...`);

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

        refinedSegments = parseGeminiResponse(refineResponse.text, PROCESSING_CHUNK_DURATION);

        if (refinedSegments.length === 0) {
          refinedSegments = [...rawSegments];
        }
      } catch (e) {
        console.error(`Refinement failed for chunk ${chunkIndex}, falling back to raw.`, e);
        refinedSegments = [...rawSegments];
      }
    }

    // D. Step 3: Gemini Translate (2.5 Flash)
    let finalChunkSubs: SubtitleItem[] = [];
    if (refinedSegments.length > 0) {
      onProgress?.(`[Chunk ${chunkIndex}] 3/3 Translating (Text-Only)...`);

      const toTranslate = refinedSegments.map((seg, idx) => ({
        id: idx + 1,
        original: seg.original,
        start: seg.startTime,
        end: seg.endTime
      }));

      const translateSystemInstruction = getSystemInstruction(settings.genre, settings.customTranslationPrompt, 'translation');
      const translatedItems = await translateBatch(ai, toTranslate, translateSystemInstruction);

      finalChunkSubs = translatedItems.map(item => ({
        id: globalIdCounter++,
        startTime: formatTime(timeToSeconds(item.start) + cursor),
        endTime: formatTime(timeToSeconds(item.end) + cursor),
        original: item.original,
        translated: item.translated
      }));
    }

    allSubtitles = [...allSubtitles, ...finalChunkSubs];
    onIntermediateResult?.(allSubtitles);

    cursor += PROCESSING_CHUNK_DURATION;
    chunkIndex++;
  }

  return allSubtitles;
};

// --- HELPERS ---

async function translateBatch(ai: GoogleGenAI, items: any[], systemInstruction: string): Promise<any[]> {
  const result: any[] = [];

  for (let i = 0; i < items.length; i += TRANSLATION_BATCH_SIZE) {
    const batch = items.slice(i, i + TRANSLATION_BATCH_SIZE);
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

      batch.forEach(item => {
        const translatedText = transMap.get(item.id);
        // Fallback: If translation is missing or empty, use original text.
        // This prevents empty subtitles in the final output.
        result.push({
          ...item,
          translated: (translatedText && translatedText.trim().length > 0) ? translatedText : item.original
        });
      });

    } catch (e) {
      console.error("Translation batch failed", e);
      // Fallback: Use original text on API failure
      batch.forEach(item => {
        result.push({ ...item, translated: item.original });
      });
    }
  }
  return result;
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

  if (audioBuffer && needsAudio) {
    try {
      if (startSec < endSec) {
        // Add padding to context
        const blob = await sliceAudioBuffer(audioBuffer, Math.max(0, startSec - 1), Math.min(audioBuffer.duration, endSec + 1));
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
        3. **SPLIT LONG LINES**: If a segment is > 4s or > 25 chars, SPLIT IT.
        4. **LANGUAGE**: 'text_translated' MUST BE SIMPLIFIED CHINESE. Do not output English in this field.
        
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
    const parts: any[] = [{ text: prompt }];
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

    const response = await generateContentWithRetry(ai, {
      model: model,
      contents: { parts: parts },
      config: {
        responseMimeType: "application/json",
        systemInstruction: systemInstruction,
        safetySettings: SAFETY_SETTINGS,
      }
    });

    const text = response.text || "[]";
    const processedBatch = parseGeminiResponse(text, totalVideoDuration);

    if (processedBatch.length > 0) {
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
  onProgress?: (msg: string) => void
): Promise<SubtitleItem[]> => {
  const geminiKey = settings.geminiKey?.trim() || process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error("API Key is missing.");
  const ai = new GoogleGenAI({ apiKey: geminiKey });

  let audioBuffer: AudioBuffer | null = null;
  // Retranslate doesn't strictly need audio context loaded upfront if we aren't slicing, 
  // but processBatch logic for retranslate ignores audio anyway. 
  // However, Proofread and Fix Timestamps need it.
  if (mode !== 'retranslate' && file) {
    onProgress?.("Loading audio for context...");
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
  for (let i = 0; i < currentSubtitles.length; i += PROOFREAD_BATCH_SIZE) {
    chunks.push(currentSubtitles.slice(i, i + PROOFREAD_BATCH_SIZE));
  }

  const sortedIndices = [...batchIndices].sort((a, b) => a - b);

  for (let i = 0; i < sortedIndices.length; i++) {
    const batchIdx = sortedIndices[i];
    if (batchIdx >= chunks.length) continue;

    const batch = chunks[batchIdx];

    // Context for timestamps
    let lastEndTime = "00:00:00,000";
    if (batchIdx > 0) {
      const prevChunk = chunks[batchIdx - 1];
      if (prevChunk.length > 0) {
        lastEndTime = prevChunk[prevChunk.length - 1].endTime;
      }
    }

    let actionLabel = "";
    if (mode === 'proofread') actionLabel = "Polishing";
    else if (mode === 'fix_timestamps') actionLabel = "Aligning";
    else actionLabel = "Translating";

    onProgress?.(`${actionLabel} Segment ${batchIdx + 1} (${i + 1}/${sortedIndices.length})...`);

    const processed = await processBatch(
      ai,
      batch,
      audioBuffer,
      lastEndTime,
      settings,
      systemInstruction,
      `${batchIdx + 1}`,
      audioBuffer?.duration,
      mode,
      batchComments[batchIdx] // Pass the comment for this specific batch
    );

    chunks[batchIdx] = processed;
  }

  return chunks.flat().map((s, i) => ({ ...s, id: i + 1 }));
};
