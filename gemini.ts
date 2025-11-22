import { GoogleGenAI, Type } from "@google/genai";
import { parseGeminiResponse, fileToBase64, formatTime } from "./utils";
import { SubtitleItem } from "./types";

const SEGMENT_DURATION_SEC = 600; // 10 minutes per segment
const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024; // 100MB
const PROOFREAD_BATCH_SIZE = 50; // Number of lines to proofread per batch to avoid output token limits

// Schema definition to force strict JSON structure
const SUBTITLE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      start: { type: Type.STRING, description: "Start timestamp (HH:MM:SS,mmm)" },
      end: { type: Type.STRING, description: "End timestamp (HH:MM:SS,mmm)" },
      text_original: { type: Type.STRING, description: "Transcription of the audio" },
      text_translated: { type: Type.STRING, description: "Simplified Chinese translation" },
    },
    required: ["start", "end", "text_original", "text_translated"],
  },
};

// Defined centrally to ensure consistency across both small and large file strategies
const SYSTEM_INSTRUCTION = `
You are a professional video subtitle generator.
Your timestamps must be extremely accurate and strictly formatted.

CRITICAL RULES FOR TIMESTAMPS:
1. Format MUST be "HH:MM:SS,mmm" (Hours:Minutes:Seconds,Milliseconds).
2. SECONDS (SS) MUST NEVER EXCEED 59.
3. MILLISECONDS (mmm) must be 3 digits (e.g. 500).
4. START TIME MUST ALWAYS BE LESS THAN END TIME.
5. SINGLE SUBTITLE DURATION:
   - A single subtitle line usually lasts 1 to 6 seconds.
   - If a subtitle lasts > 10 seconds, verify the timestamps.
   - NEVER generate a subtitle that lasts minutes.

FINAL VERIFICATION STEP:
Before outputting JSON, review every subtitle item:
- Is start < end?
- Is duration < 10s?
- Is text accurate?
If you find errors, CORRECT them immediately.

Output strictly valid JSON matching the requested schema.
`;

const PROOFREAD_SYSTEM_INSTRUCTION = `
You are an expert subtitle editor and translator specializing in Simplified Chinese localization.
Your task is to review and improve existing subtitles.

RULES:
1. Improve the "text_translated" field for natural flow, nuance, and grammatical correctness in Simplified Chinese.
2. Do NOT change the "start" or "end" timestamps. They must remain exactly as provided.
3. Do NOT change the "text_original" unless there is a blatant transcription error.
4. Return the result strictly as a JSON array matching the input structure.
`;

export const generateSubtitles = async (
  file: File, 
  duration: number,
  apiKey: string, 
  onProgress?: (msg: string) => void
): Promise<SubtitleItem[]> => {
  
  if (!apiKey) throw new Error("API Key is missing.");

  const ai = new GoogleGenAI({ apiKey });
  const mimeType = file.type || 'video/mp4';

  // --- Strategy Selection ---
  // If file is small (< 100MB), use inlineData (Fastest, no upload wait).
  // If file is large (> 100MB), use Files API + Segmentation loop.
  
  if (file.size < LARGE_FILE_THRESHOLD) {
    return generateSmallFile(ai, file, duration, mimeType, onProgress);
  } else {
    return generateLargeFile(ai, file, duration, mimeType, onProgress);
  }
};

export const proofreadSubtitles = async (
  subtitles: SubtitleItem[],
  apiKey: string,
  onProgress?: (msg: string) => void
): Promise<SubtitleItem[]> => {
  if (!apiKey) throw new Error("API Key is missing.");
  const ai = new GoogleGenAI({ apiKey });
  
  const totalBatches = Math.ceil(subtitles.length / PROOFREAD_BATCH_SIZE);
  let refinedSubtitles: SubtitleItem[] = [];

  for (let i = 0; i < totalBatches; i++) {
    const startIdx = i * PROOFREAD_BATCH_SIZE;
    const endIdx = startIdx + PROOFREAD_BATCH_SIZE;
    const batch = subtitles.slice(startIdx, endIdx);

    onProgress?.(`Proofreading batch ${i + 1}/${totalBatches}...`);

    // Create a simplified payload to save tokens, but keep necessary fields
    const payload = batch.map(s => ({
      id: s.id,
      start: s.startTime,
      end: s.endTime,
      text_original: s.original,
      text_translated: s.translated
    }));

    const prompt = `
      Refine the following subtitles (Batch ${i+1}/${totalBatches}).
      Focus on making the Simplified Chinese translation (text_translated) sound professional, colloquial, and contextually accurate.
      
      Input JSON:
      ${JSON.stringify(payload)}
    `;

    const responseSchema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.INTEGER },
          start: { type: Type.STRING },
          end: { type: Type.STRING },
          text_original: { type: Type.STRING },
          text_translated: { type: Type.STRING }
        },
        required: ["id", "start", "end", "text_original", "text_translated"]
      }
    };

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview', // Use the high-intelligence model for proofreading
        contents: { parts: [{ text: prompt }] },
        config: {
          responseMimeType: "application/json",
          responseSchema: responseSchema,
          systemInstruction: PROOFREAD_SYSTEM_INSTRUCTION,
        }
      });

      const jsonStr = response.text || "[]";
      // Added robustness: remove markdown if present (3-Pro sometimes does this even with JSON mode)
      const cleanJson = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
      
      let parsedBatch: any[] = [];
      try {
        parsedBatch = JSON.parse(cleanJson);
      } catch (e) {
        console.warn(`JSON parse failed for batch ${i+1}, attempting fallback`, e);
        // Fallback: try to find array brackets
        const match = cleanJson.match(/\[.*\]/s);
        if (match) {
           parsedBatch = JSON.parse(match[0]);
        }
      }

      if (!Array.isArray(parsedBatch)) parsedBatch = [];

      // Map back to SubtitleItem structure and filter empty lines
      const processedBatch: SubtitleItem[] = parsedBatch
        .filter(item => {
           const o = item.text_original ? String(item.text_original).trim() : '';
           const t = item.text_translated ? String(item.text_translated).trim() : '';
           return o.length > 0 || t.length > 0;
        })
        .map(item => ({
          id: item.id,
          startTime: item.start,
          endTime: item.end,
          original: item.text_original,
          translated: item.text_translated
        }));

      refinedSubtitles = [...refinedSubtitles, ...processedBatch];

    } catch (e) {
      console.error(`Batch ${i+1} proofreading failed. Using original for this batch.`, e);
      // Fallback: keep original if proofreading fails for a batch
      refinedSubtitles = [...refinedSubtitles, ...batch];
    }
  }

  return refinedSubtitles;
};

/**
 * FAST PATH: For small files, send directly in the request.
 */
async function generateSmallFile(
  ai: GoogleGenAI, 
  file: File, 
  duration: number,
  mimeType: string, 
  onProgress?: (msg: string) => void
): Promise<SubtitleItem[]> {
  
  onProgress?.("Processing small file (Direct Mode)...");
  const base64Data = await fileToBase64(file);
  
  const durationStr = duration ? `The video is exactly ${formatTime(duration)} long.` : '';

  const prompt = `
    Task: Generate bilingual subtitles for this media file.
    ${durationStr}
    
    STRICT REQUIREMENTS:
    1. Transcribe the audio accurately in its original language.
    2. Translate each segment into Simplified Chinese.
    3. Timestamp Format: HH:MM:SS,mmm (Example: 00:00:05,123).
    4. VERIFY: Ensure Seconds < 60. Ensure you don't confuse minutes (05:00) with seconds (00:05).
    5. DOUBLE CHECK: No timestamp can exceed ${formatTime(duration)}. If you wrote "01:00:00" for a 2-minute video, CORRECT IT to "00:01:00".
    6. SANITY CHECK: Ensure Start Time < End Time. If a subtitle is longer than 10 seconds, SHORTEN THE END TIME.
    
    FINAL CHECK: Review your output. If you see Start > End, SWAP them. If you see a duration > 10s, fix it.
    
    Ensure you capture all spoken dialogue.
  `;

  // We use gemini-2.5-flash for speed/cost, but instructions are reinforced
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: {
      parts: [
        { inlineData: { mimeType, data: base64Data } },
        { text: prompt }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: SUBTITLE_SCHEMA,
      systemInstruction: SYSTEM_INSTRUCTION, 
    }
  });

  onProgress?.("Parsing subtitles...");
  return parseGeminiResponse(response.text, duration);
}

/**
 * ROBUST PATH: For large files, upload to Google, then process in segments.
 */
async function generateLargeFile(
  ai: GoogleGenAI, 
  file: File, 
  duration: number,
  mimeType: string,
  onProgress?: (msg: string) => void
): Promise<SubtitleItem[]> {

  onProgress?.("File is large. Uploading to Gemini Storage...");
  
  // 1. Upload File
  const uploadResponse = await ai.files.upload({
    file: file,
    config: { mimeType, displayName: file.name }
  });
  
  // Safety Check: Ensure the file was actually uploaded and URI exists
  if (!uploadResponse.file || !uploadResponse.file.uri) {
     throw new Error("File upload failed. Google Gemini did not return a valid file URI. Please try again or use a smaller file.");
  }
  
  const fileUri = uploadResponse.file.uri;
  const fileName = uploadResponse.file.name; // Resource name

  // 2. Wait for processing (Active)
  onProgress?.("Waiting for file processing...");
  let state = uploadResponse.file.state;
  while (state === 'PROCESSING') {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const fileStatus = await ai.files.get({ name: fileName });
    state = fileStatus.file.state;
    if (state === 'FAILED') throw new Error("File processing failed on server.");
  }

  // 3. Segmented Processing Loop
  let allSubtitles: SubtitleItem[] = [];
  let currentTime = 0;
  let segmentIndex = 1;
  const totalSegments = Math.ceil(duration / SEGMENT_DURATION_SEC);

  try {
    while (currentTime < duration) {
      const endTime = Math.min(currentTime + SEGMENT_DURATION_SEC, duration);
      const startStr = formatTime(currentTime);
      const endStr = formatTime(endTime);
      
      onProgress?.(`Processing Segment ${segmentIndex}/${totalSegments} (${startStr} - ${endStr})...`);

      const prompt = `
        Task: Generate bilingual subtitles for the video segment from ${startStr} to ${endStr}.
        Only generate subtitles for audio falling STRICTLY within this time range.
        
        STRICT REQUIREMENTS:
        1. Timestamps MUST be relative to the START of the VIDEO (e.g. if segment starts at 10:00, first sub should be around 10:00, not 00:00).
        2. Format: HH:MM:SS,mmm.
        3. Double check: Start Time < End Time.
        4. CAUTION: Do not make subtitles longer than 10 seconds.
        5. VERIFY: Are your timestamps within ${startStr} and ${endStr}?
        
        FINAL CHECK: Review start/end times carefully. Fix any illogical timestamps before outputting.
      `;

      // Use 2.5 Flash for segments
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
          parts: [
            { fileData: { mimeType, fileUri } },
            { text: prompt }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: SUBTITLE_SCHEMA,
          systemInstruction: SYSTEM_INSTRUCTION
        }
      });

      const segmentSubs = parseGeminiResponse(response.text, duration);
      allSubtitles = [...allSubtitles, ...segmentSubs];

      currentTime += SEGMENT_DURATION_SEC;
      segmentIndex++;
      
      // Basic rate limit handling
      await new Promise(r => setTimeout(r, 1000));
    }
  } finally {
    // Cleanup: Delete file from Gemini Storage
    // onProgress?.("Cleaning up...");
    // await ai.files.delete({ name: fileName });
  }

  // Re-index IDs
  return allSubtitles.map((sub, idx) => ({ ...sub, id: idx + 1 }));
}
