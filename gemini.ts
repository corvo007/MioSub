import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { parseGeminiResponse, formatTime, decodeAudio, sliceAudioBuffer, transcribeAudio, timeToSeconds, blobToBase64 } from "./utils";
import { SubtitleItem, AppSettings, Genre } from "./types";

const PROOFREAD_BATCH_SIZE = 50; 
const TRANSLATION_BATCH_SIZE = 20;
const WHISPER_CHUNK_DURATION = 240; // 4 minutes per chunk

// --- SCHEMAS ---

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

// --- PROMPT GENERATORS ---

const getSystemInstruction = (genre: Genre, customPrompt?: string, mode: 'translation' | 'proofreading' = 'translation'): string => {
  if (customPrompt && customPrompt.trim().length > 0) {
    return customPrompt;
  }

  const baseInstruction = mode === 'translation' 
    ? `You are a professional subtitle translator. Your task is to translate subtitles into Simplified Chinese (Zh-CN).
       RULES:
       1. Translate "text" to "text_translated".
       2. Maintain the "id".
       3. Output valid JSON.`
    : `You are an expert Subtitle Quality Assurance Specialist using Gemini 3 Pro.
       Your goal is to perfect the subtitles by fixing timestamps, formatting, transcription errors, and translation errors.
       Return valid JSON matching input structure.`;

  let genreContext = "";
  switch (genre) {
    case 'anime':
      genreContext = `
      GENRE: Anime / Animation.
      TONE: Casual, emotive, character-driven.
      RULES:
      - Preserve Japanese honorifics nuances if apparent.
      - Use natural spoken Chinese suited for anime subtitles.
      - Handle slang and internet terminology appropriately.
      `;
      break;
    case 'movie':
      genreContext = `
      GENRE: Movies / TV Series.
      TONE: Cinematic, natural dialogue.
      RULES:
      - Focus on brevity and reading speed.
      - Ensure dialogue sounds natural in Chinese.
      - Contextualize cultural references.
      `;
      break;
    case 'news':
      genreContext = `
      GENRE: News / Documentary.
      TONE: Formal, objective, concise.
      RULES:
      - Use standard journalistic terminology.
      - Ensure factual accuracy in translation.
      - No colloquialisms unless in a direct quote.
      `;
      break;
    case 'tech':
      genreContext = `
      GENRE: Technology / IT / Educational.
      TONE: Professional, precise.
      RULES:
      - Accurately translate technical terms (keep English acronyms if standard, e.g., API, JSON).
      - Ensure clarity of explanation.
      `;
      break;
    case 'general':
    default:
      genreContext = "GENRE: General purpose. Keep translation neutral and accurate.";
      break;
  }

  return `${baseInstruction}\n\n${genreContext}`;
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
  onProgress?: (msg: string) => void
): Promise<SubtitleItem[]> => {
  
  if (!settings.geminiKey) throw new Error("Gemini API Key is missing.");
  if (!settings.openaiKey) throw new Error("OpenAI API Key is missing.");
  
  const ai = new GoogleGenAI({ apiKey: settings.geminiKey });

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
  const totalChunks = Math.ceil(totalDuration / WHISPER_CHUNK_DURATION);
  let allSubtitles: SubtitleItem[] = [];

  // 2. Loop: Slice -> Transcribe (Whisper/GPT-4o) -> Translate
  while (cursor < totalDuration) {
    const end = Math.min(cursor + WHISPER_CHUNK_DURATION, totalDuration);
    onProgress?.(`Processing Chunk ${chunkIndex}/${totalChunks} (${formatTime(cursor)} - ${formatTime(end)})...`);
    
    // A. Slice Audio
    const wavBlob = await sliceAudioBuffer(audioBuffer, cursor, end);
    
    // B. Transcribe
    onProgress?.(`[Chunk ${chunkIndex}] Transcribing with ${settings.transcriptionModel}...`);
    let chunkItems: SubtitleItem[] = [];
    try {
      chunkItems = await transcribeAudio(wavBlob, settings.openaiKey, settings.transcriptionModel);
    } catch (e: any) {
      console.error(e);
      throw new Error(`Transcription failed on chunk ${chunkIndex}: ${e.message}`);
    }

    // C. Adjust Timestamps
    if (cursor > 0) {
      chunkItems = chunkItems.map(item => {
        const startSec = timeToSeconds(item.startTime) + cursor;
        const endSec = timeToSeconds(item.endTime) + cursor;
        return {
          ...item,
          startTime: formatTime(startSec),
          endTime: formatTime(endSec)
        };
      });
    }

    // D. Translate with Gemini
    if (chunkItems.length > 0) {
      onProgress?.(`[Chunk ${chunkIndex}] Translating with Gemini...`);
      const systemInstruction = getSystemInstruction(settings.genre, settings.customTranslationPrompt, 'translation');
      const translatedChunk = await translateBatch(ai, chunkItems, systemInstruction);
      allSubtitles = [...allSubtitles, ...translatedChunk];
    }

    cursor += WHISPER_CHUNK_DURATION;
    chunkIndex++;
  }

  return allSubtitles.map((s, i) => ({ ...s, id: i + 1 }));
};

// --- HELPERS ---

async function translateBatch(ai: GoogleGenAI, items: SubtitleItem[], systemInstruction: string): Promise<SubtitleItem[]> {
  const result: SubtitleItem[] = [];
  
  for (let i = 0; i < items.length; i += TRANSLATION_BATCH_SIZE) {
    const batch = items.slice(i, i + TRANSLATION_BATCH_SIZE);
    const payload = batch.map(item => ({ id: item.id, text: item.original }));
    const prompt = `Translate to Simplified Chinese:\n${JSON.stringify(payload)}`;

    try {
      const response = await ai.models.generateContent({
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
      result.push(...batch);
    }
  }
  return result;
}

// --- PROOFREADING ---

export const proofreadSubtitles = async (
  file: File,
  subtitles: SubtitleItem[],
  settings: AppSettings,
  onProgress?: (msg: string) => void
): Promise<SubtitleItem[]> => {
  if (!settings.geminiKey) throw new Error("API Key is missing.");
  
  const ai = new GoogleGenAI({ apiKey: settings.geminiKey });
  
  // Audio context for proofreading context
  onProgress?.("Loading audio for contextual proofreading...");
  let audioBuffer: AudioBuffer;
  try {
     audioBuffer = await decodeAudio(file);
  } catch(e) {
     console.warn("Could not decode audio for proofreading, falling back to text-only.");
     return proofreadTextOnly(subtitles, settings, ai, onProgress);
  }

  const totalBatches = Math.ceil(subtitles.length / PROOFREAD_BATCH_SIZE);
  let refinedSubtitles: SubtitleItem[] = [];
  let lastEndTime = "00:00:00,000";
  const systemInstruction = getSystemInstruction(settings.genre, settings.customProofreadingPrompt, 'proofreading');

  for (let i = 0; i < totalBatches; i++) {
    const startIdx = i * PROOFREAD_BATCH_SIZE;
    const endIdx = startIdx + PROOFREAD_BATCH_SIZE;
    const batch = subtitles.slice(startIdx, endIdx);

    onProgress?.(`Proofreading batch ${i + 1}/${totalBatches} (Listening & Analyzing)...`);

    // Get time range for this batch
    const batchStartStr = batch[0].startTime;
    const batchEndStr = batch[batch.length - 1].endTime;
    const startSec = timeToSeconds(batchStartStr);
    const endSec = timeToSeconds(batchEndStr);

    // Extract Audio Chunk
    let base64Audio = "";
    try {
        // Add 1s padding
        const blob = await sliceAudioBuffer(audioBuffer, Math.max(0, startSec - 1), Math.min(audioBuffer.duration, endSec + 1));
        base64Audio = await blobToBase64(blob);
    } catch(e) {
        console.warn("Audio slice failed, sending text only.");
    }

    const payload = batch.map(s => ({
      id: s.id,
      start: s.startTime,
      end: s.endTime,
      text_original: s.original,
      text_translated: s.translated
    }));

    const prompt = `
      Batch ${i+1}/${totalBatches}.
      PREVIOUS END TIME: "${lastEndTime}".
      
      INSTRUCTIONS:
      1. Listen to the audio.
      2. Fix transcription errors (source).
      3. Fix translation errors (Chinese).
      4. SPLIT long lines if the audio has pauses.
      5. Adjust timestamps to match audio perfectly.
      6. Return valid JSON.
      
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

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview', // Required for huge context/audio understanding
        contents: { parts: parts },
        config: {
          responseMimeType: "application/json",
          systemInstruction: systemInstruction,
          safetySettings: SAFETY_SETTINGS,
        }
      });

      const text = response.text || "[]";
      const processedBatch = parseGeminiResponse(text);

      if (processedBatch.length > 0) {
        lastEndTime = processedBatch[processedBatch.length - 1].endTime;
        refinedSubtitles = [...refinedSubtitles, ...processedBatch];
      } else {
        refinedSubtitles = [...refinedSubtitles, ...batch];
      }

    } catch (e) {
      console.error(`Batch ${i+1} proofreading failed.`, e);
      refinedSubtitles = [...refinedSubtitles, ...batch];
      if (batch.length > 0) lastEndTime = batch[batch.length - 1].endTime;
    }
  }

  // Final re-numbering
  return refinedSubtitles.map((s, i) => ({ ...s, id: i + 1 }));
};

// Fallback for text-only proofreading
async function proofreadTextOnly(subtitles: SubtitleItem[], settings: AppSettings, ai: GoogleGenAI, onProgress?: (msg: string) => void): Promise<SubtitleItem[]> {
    const systemInstruction = getSystemInstruction(settings.genre, settings.customProofreadingPrompt, 'proofreading');
    const totalBatches = Math.ceil(subtitles.length / PROOFREAD_BATCH_SIZE);
    let refined: SubtitleItem[] = [];

    for (let i = 0; i < totalBatches; i++) {
        const batch = subtitles.slice(i*PROOFREAD_BATCH_SIZE, (i+1)*PROOFREAD_BATCH_SIZE);
        onProgress?.(`Proofreading batch ${i+1}/${totalBatches} (Text Only)...`);
        
        try {
            const prompt = `Refine these subtitles:\n${JSON.stringify(batch)}`;
            const response = await ai.models.generateContent({
                model: 'gemini-3-pro-preview',
                contents: { parts: [{ text: prompt }] },
                config: { responseMimeType: "application/json", systemInstruction }
            });
            const parsed = parseGeminiResponse(response.text);
            refined = [...refined, ...(parsed.length ? parsed : batch)];
        } catch(e) {
            refined = [...refined, ...batch];
        }
    }
    return refined;
}