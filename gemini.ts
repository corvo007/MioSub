
import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { parseGeminiResponse, formatTime, decodeAudio, sliceAudioBuffer, transcribeAudio, timeToSeconds, blobToBase64 } from "./utils";
import { SubtitleItem, AppSettings, Genre } from "./types";

export const PROOFREAD_BATCH_SIZE = 20;
const TRANSLATION_BATCH_SIZE = 20;
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

const getSystemInstruction = (genre: string, customPrompt?: string, mode: 'refinement' | 'translation' | 'proofreading' = 'translation'): string => {
  if (customPrompt && customPrompt.trim().length > 0) {
    return customPrompt;
  }

  // 1. Refinement Prompt (Flash 2.5)
  if (mode === 'refinement') {
    return `You are a professional Subtitle QA Specialist. 
    You will receive an audio chunk and a raw JSON transcription.
    
    YOUR TASKS:
    1. Listen to the audio to verify the transcription.
    2. FIX TIMESTAMPS: Ensure start/end times match the audio speech perfectly. **Timestamps MUST be within the duration of the audio provided. Do NOT hallucinate hours if the audio is only minutes.**
    3. FIX TRANSCRIPTION: Correct mishearings, typos, and proper nouns (names, terminology).
    4. IGNORE FILLERS: Do not transcribe stuttering or meaningless filler words (uh, um, ah, eto, ano, 呃, 那个) unless necessary for context.
    5. SPLIT LINES: If a segment is too long (> 15 words or > 4 seconds) or contains multiple sentences, SPLIT it into multiple segments.
    6. REMOVE HALLUCINATIONS: Delete segments that have no corresponding speech in the audio.
    7. FORMAT: Return a valid JSON array of objects with "start", "end", and "text".
    
    Genre Context: ${genre}`;
  }

  // 2. Translation Prompt (Flash 2.5)
  if (mode === 'translation') {
    let genreContext = "";
    switch (genre) {
      case 'anime': genreContext = "Genre: Anime. Use casual, emotive tone. Preserve honorifics nuances."; break;
      case 'movie': genreContext = "Genre: Movie/TV. Natural dialogue, concise, easy to read."; break;
      case 'news': genreContext = "Genre: News. Formal, objective, standard terminology."; break;
      case 'tech': genreContext = "Genre: Tech. Precise terminology. Keep standard English acronyms."; break;
      case 'general': genreContext = "Genre: General. Neutral and accurate."; break;
      default: 
        // Custom Context Handling
        genreContext = `Context: ${genre}. Translate using tone, terminology, and style appropriate for this specific context.`; 
        break;
    }

    return `You are a professional translator. Translate the following subtitles to Simplified Chinese (zh-CN).
    RULES:
    1. Translate "text" to "text_translated".
    2. Maintain the "id" exactly.
    3. **REMOVE FILLER WORDS**: Completely ignore and remove stuttering, hesitation, and filler words (e.g., "uh", "um", "ah", "eto", "ano", "呃", "这个", "那个", "嗯"). The translation must be fluent written Chinese, not a literal transcription of broken speech.
    4. Output valid JSON.
    ${genreContext}`;
  }

  // 3. Deep Proofreading Prompt (Pro 3)
  return `You are an expert Subtitle Quality Assurance Specialist using Gemini 3 Pro.
    Your goal is to perfect the subtitles.
    
    CRITICAL INSTRUCTIONS:
    1. **REMOVE FILLER WORDS**: Delete any remaining filler words (e.g., 呃, 嗯, 啊, eto, ano) that disrupt flow. The result should be clean, professional subtitles.
    2. **FIX TIMESTAMPS**: Ensure they are strictly within the audio range. Do not allow timestamps to exceed the video duration.
    3. **FLUENCY**: Ensure the Chinese translation is natural and culturally appropriate for the context: ${genre}.
    4. Return valid JSON matching input structure.`;
};

// --- MAIN FUNCTIONS ---

export const generateSubtitles = async (
  file: File, 
  duration: number,
  settings: AppSettings,
  onProgress?: (msg: string) => void,
  onIntermediateResult?: (subs: SubtitleItem[]) => void
): Promise<SubtitleItem[]> => {
  
  const geminiKey = settings.geminiKey?.trim();
  const openaiKey = settings.openaiKey?.trim();

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
            
            // Pass cursor + duration as maxDuration to prevent timestamp hallucinations
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
    const prompt = `Translate to Simplified Chinese. REMOVE ALL FILLER WORDS:\n${JSON.stringify(payload)}`;

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
        result.push({
          ...item,
          translated: transMap.get(item.id) || "" 
        });
      });

    } catch (e) {
      console.error("Translation batch failed", e);
      batch.forEach(item => {
        result.push({ ...item, translated: "" });
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
  totalVideoDuration?: number
): Promise<SubtitleItem[]> {
    if (batch.length === 0) return [];

    const batchStartStr = batch[0].startTime;
    const batchEndStr = batch[batch.length - 1].endTime;
    const startSec = timeToSeconds(batchStartStr);
    const endSec = timeToSeconds(batchEndStr);

    let base64Audio = "";
    if (audioBuffer) {
        try {
            if (startSec < endSec) {
                // Add padding to context
                const blob = await sliceAudioBuffer(audioBuffer, Math.max(0, startSec - 1), Math.min(audioBuffer.duration, endSec + 1));
                base64Audio = await blobToBase64(blob);
            }
        } catch(e) {
            console.warn(`Audio slice failed for ${batchLabel}, falling back to text-only.`);
        }
    }

    const payload = batch.map(s => ({
      id: s.id,
      start: s.startTime,
      end: s.endTime,
      text_original: s.original,
      text_translated: s.translated
    }));

    const prompt = `
      Batch ${batchLabel}.
      PREVIOUS END TIME: "${lastEndTime}".
      TOTAL VIDEO DURATION (approx): ${totalVideoDuration ? formatTime(totalVideoDuration) : 'Unknown'}.
      
      INSTRUCTIONS:
      1. Listen to the audio (if available).
      2. **REMOVE FILLER WORDS**: Delete any and all filler words (e.g., 呃, 嗯, 啊, eto, ano) to create clean, fluent Chinese subtitles.
      3. Fix transcription errors (source).
      4. Fix translation errors (Chinese).
      5. SPLIT long lines if the audio has pauses.
      6. **FIX TIMESTAMPS**: Adjust start/end times to match audio perfectly. **DO NOT generate timestamps past the actual audio.**
      7. Return valid JSON.
      
      Current Subtitles JSON:
      ${JSON.stringify(payload)}
    `;

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

      const response = await generateContentWithRetry(ai, {
        model: 'gemini-3-pro-preview',
        contents: { parts: parts },
        config: {
          responseMimeType: "application/json",
          systemInstruction: systemInstruction,
          safetySettings: SAFETY_SETTINGS,
        }
      });

      const text = response.text || "[]";
      // Use totalVideoDuration as maxDuration to filter out hallucinations
      const processedBatch = parseGeminiResponse(text, totalVideoDuration);

      if (processedBatch.length > 0) {
        return processedBatch;
      }
    } catch (e) {
      console.error(`Batch ${batchLabel} processing failed.`, e);
    }
    // Fallback: return original batch
    return batch;
}

// --- PROOFREADING FUNCTIONS ---

export const proofreadSpecificBatches = async (
  file: File,
  allSubtitles: SubtitleItem[],
  batchIndices: number[], // 0-based indices of chunks
  settings: AppSettings,
  onProgress?: (msg: string) => void
): Promise<SubtitleItem[]> => {
  const geminiKey = settings.geminiKey?.trim();
  if (!geminiKey) throw new Error("API Key is missing.");
  const ai = new GoogleGenAI({ apiKey: geminiKey });

  onProgress?.("Loading audio for context...");
  let audioBuffer: AudioBuffer | null = null;
  try {
     audioBuffer = await decodeAudio(file);
  } catch(e) {
     console.warn("Audio decode failed, proceeding with text-only mode.");
  }
  
  const systemInstruction = getSystemInstruction(settings.genre, settings.customProofreadingPrompt, 'proofreading');
  
  // Clone subtitles
  const currentSubtitles = [...allSubtitles];
  
  // Split into chunks to manage replacement easily
  const chunks: SubtitleItem[][] = [];
  for (let i = 0; i < currentSubtitles.length; i += PROOFREAD_BATCH_SIZE) {
      chunks.push(currentSubtitles.slice(i, i + PROOFREAD_BATCH_SIZE));
  }
  
  const sortedIndices = [...batchIndices].sort((a, b) => a - b);
  
  for (let i = 0; i < sortedIndices.length; i++) {
     const batchIdx = sortedIndices[i];
     if (batchIdx >= chunks.length) continue;
     
     const batch = chunks[batchIdx];
     
     // Get lastEndTime from the end of the previous chunk (processed or not)
     let lastEndTime = "00:00:00,000";
     if (batchIdx > 0) {
         const prevChunk = chunks[batchIdx - 1];
         if (prevChunk.length > 0) {
             lastEndTime = prevChunk[prevChunk.length - 1].endTime;
         }
     }
     
     onProgress?.(`Polishing Segment ${batchIdx + 1} (${i + 1}/${sortedIndices.length})...`);
     
     const processed = await processBatch(
        ai, 
        batch, 
        audioBuffer, 
        lastEndTime, 
        settings, 
        systemInstruction, 
        `${batchIdx + 1}`,
        audioBuffer?.duration
     );
     
     // Update the chunk in place
     chunks[batchIdx] = processed;
  }
  
  // Flatten and re-ID
  return chunks.flat().map((s, i) => ({ ...s, id: i + 1 }));
};

export const proofreadSubtitles = async (
  file: File,
  subtitles: SubtitleItem[],
  settings: AppSettings,
  onProgress?: (msg: string) => void
): Promise<SubtitleItem[]> => {
  // Process ALL batches
  const totalBatches = Math.ceil(subtitles.length / PROOFREAD_BATCH_SIZE);
  const allIndices = Array.from({ length: totalBatches }, (_, i) => i);
  return proofreadSpecificBatches(file, subtitles, allIndices, settings, onProgress);
};
