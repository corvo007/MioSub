import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold, Content, Part } from "@google/genai";
import { ConsistencyIssue } from "./consistencyValidation";
import { parseGeminiResponse, formatTime, decodeAudio, sliceAudioBuffer, transcribeAudio, timeToSeconds, blobToBase64, extractJsonArray, mapInParallel, logger } from "./utils";
import { SubtitleItem, AppSettings, BatchOperationMode, ChunkStatus, GlossaryItem, GlossaryExtractionResult, GlossaryExtractionMetadata } from "./types";
import { getSystemInstruction, GLOSSARY_EXTRACTION_PROMPT } from "./prompts";
import { selectChunksByDuration } from "./glossaryUtils";
import { SmartSegmenter } from "./smartSegmentation";

export const PROOFREAD_BATCH_SIZE = 20; // Default fallback

// --- RATE LIMIT HELPER ---

async function generateContentWithRetry(ai: GoogleGenAI, params: any, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await ai.models.generateContent(params);

      // Log token usage
      if ((result as any).usageMetadata) {
        logger.debug("Gemini Token Usage", (result as any).usageMetadata);
      }

      // Log grounding metadata (Search Grounding verification)
      const candidates = (result as any).candidates;
      if (candidates && candidates[0]?.groundingMetadata) {
        const groundingMeta = candidates[0].groundingMetadata;
        logger.info("🔍 Search Grounding Used", {
          searchQueries: groundingMeta.searchQueries || [],
          groundingSupports: groundingMeta.groundingSupports?.length || 0,
          webSearchQueries: groundingMeta.webSearchQueries?.length || 0
        });
      } else if (params.tools && params.tools.some((t: any) => t.googleSearch)) {
        logger.warn("⚠️ Search Grounding was configured but NOT used in this response");
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

async function decodeAudioWithRetry(file: File, retries = 3): Promise<AudioBuffer> {
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

async function generateContentWithLongOutput(
  ai: GoogleGenAI,
  modelName: string,
  systemInstruction: string,
  parts: Part[],
  schema: any,
  tools?: any[]
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
        tools: tools, // Pass tools for Search Grounding
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

const GLOSSARY_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      term: { type: Type.STRING, description: "Original term from the audio" },
      translation: { type: Type.STRING, description: "Simplified Chinese translation" },
      notes: { type: Type.STRING, description: "Optional notes for pronunciation or context" },
    },
    required: ["term", "translation"],
  },
};

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// --- ERROR CLASSIFICATION HELPER ---

/**
 * Determines if an error should trigger a retry attempt.
 * Returns true for transient errors (network, server, parsing), false for permanent errors (auth, quota).
 */
function isRetryableError(error: any): boolean {
  // Network errors (transient)
  if (error.message?.includes('network') || error.message?.includes('timeout') || error.message?.includes('fetch')) {
    return true;
  }

  // JSON parsing errors (might be transient response corruption)
  if (error instanceof SyntaxError || error.name === 'SyntaxError') {
    return true;
  }

  // 5xx server errors (transient)
  if (error.status >= 500 && error.status < 600) {
    return true;
  }

  // 429 and 503 are already handled by generateContentWithRetry, but include here for completeness
  if (error.status === 429 || error.status === 503) {
    return true;
  }

  // 4xx client errors (permanent - auth, quota, bad request)
  if (error.status >= 400 && error.status < 500) {
    return false;
  }

  // Unknown errors - conservatively treat as retryable
  return true;
}

// --- GLOSSARY EXTRACTION ---

export const extractGlossaryFromAudio = async (
  ai: GoogleGenAI,
  audioBuffer: AudioBuffer,
  chunks: { index: number; start: number; end: number }[],
  genre: string,
  concurrency: number,
  onProgress?: (completed: number, total: number) => void
): Promise<GlossaryExtractionResult[]> => {
  logger.info(`Starting glossary extraction on ${chunks.length} chunks...`);

  // Track failed chunks for aggregated retry
  const failedChunks: { index: number; start: number; end: number }[] = [];
  let completed = 0;

  // Helper function to extract a single chunk with retry
  const extractSingleChunk = async (
    chunk: { index: number; start: number; end: number },
    attemptNumber: number = 1
  ): Promise<GlossaryExtractionResult> => {
    const { index, start, end } = chunk;

    try {
      const wavBlob = await sliceAudioBuffer(audioBuffer, start, end);
      const base64Audio = await blobToBase64(wavBlob);
      const prompt = GLOSSARY_EXTRACTION_PROMPT(genre);

      const response = await generateContentWithRetry(ai, {
        model: 'gemini-3-pro-preview',
        contents: {
          parts: [
            { inlineData: { mimeType: "audio/wav", data: base64Audio } },
            { text: prompt }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: GLOSSARY_SCHEMA,
          safetySettings: SAFETY_SETTINGS,
          maxOutputTokens: 65536,
          tools: [{ googleSearch: {} }],
        }
      });

      const text = response.text || "[]";
      const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const terms = JSON.parse(clean);

      const termCount = Array.isArray(terms) ? terms.length : 0;
      logger.info(`[Chunk ${index}] Extracted ${termCount} terms (Attempt ${attemptNumber})`);

      return {
        terms: Array.isArray(terms) ? terms : [],
        source: 'chunk',
        chunkIndex: index,
        confidence: 'high'
      } as GlossaryExtractionResult;

    } catch (e: any) {
      const isRetryable = isRetryableError(e);

      // Retry logic: attempt up to 3 times total
      if (isRetryable && attemptNumber < 3) {
        const delay = Math.pow(2, attemptNumber) * 1000 + Math.random() * 500;
        logger.warn(
          `[Chunk ${index}] Extraction failed (${e.message}). Retrying in ${Math.round(delay)}ms... (Attempt ${attemptNumber + 1}/3)`,
          { error: e.message, status: e.status }
        );
        await new Promise(r => setTimeout(r, delay));
        return extractSingleChunk(chunk, attemptNumber + 1);
      } else {
        // All retries exhausted or non-retryable error
        const reason = isRetryable ? `after ${attemptNumber} attempts` : '(non-retryable error)';
        logger.error(`[Chunk ${index}] Extraction failed ${reason}`, { error: e.message, status: e.status });
        throw e;
      }
    }
  };

  // ===== FIRST PASS: Process all chunks with chunk-level retry =====
  const results = await mapInParallel(chunks, concurrency, async (chunk) => {
    try {
      const result = await extractSingleChunk(chunk, 1);
      completed++;
      onProgress?.(completed, chunks.length);
      return result;

    } catch (e) {
      // Record failed chunk for aggregated retry
      failedChunks.push(chunk);
      completed++;
      onProgress?.(completed, chunks.length);

      return {
        terms: [],
        source: 'chunk',
        chunkIndex: chunk.index,
        confidence: 'low'
      } as GlossaryExtractionResult;
    }
  });

  // ===== SECOND PASS: Aggregated retry for failed chunks =====
  if (failedChunks.length > 0) {
    logger.warn(`First pass complete. ${failedChunks.length}/${chunks.length} chunks failed. Starting aggregated retry pass...`);

    // Use lower concurrency to reduce load and improve success rate
    const retryConcurrency = Math.max(1, Math.floor(concurrency / 2));

    await mapInParallel(failedChunks, retryConcurrency, async (failedChunk) => {
      try {
        logger.info(`[Chunk ${failedChunk.index}] Retry attempt (aggregated pass)`);
        const result = await extractSingleChunk(failedChunk, 1);

        // Update result in the results array
        const resultIndex = results.findIndex(r => r.chunkIndex === failedChunk.index);
        if (resultIndex !== -1) {
          results[resultIndex] = result;
        }
        logger.info(`[Chunk ${failedChunk.index}] Aggregated retry succeeded!`);

      } catch (e: any) {
        logger.error(`[Chunk ${failedChunk.index}] Aggregated retry failed`, { error: e.message, status: e.status });
      }
    });
  }

  // ===== FINAL STATISTICS =====
  const successCount = results.filter(r => r.confidence === 'high').length;
  const failCount = results.filter(r => r.confidence === 'low' && r.terms.length === 0).length;
  const totalTerms = results.reduce((sum, r) => sum + r.terms.length, 0);

  logger.info(
    `Glossary extraction complete. Success: ${successCount}/${chunks.length}, Failed: ${failCount}/${chunks.length}, Total terms: ${totalTerms}`
  );

  return results;
};

export const retryGlossaryExtraction = async (
  apiKey: string,
  audioBuffer: AudioBuffer,
  chunks: { index: number; start: number; end: number }[],
  genre: string,
  concurrency: number,
  endpoint?: string
): Promise<GlossaryExtractionMetadata> => {
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: endpoint ? { baseUrl: endpoint } : undefined
  });
  const results = await extractGlossaryFromAudio(ai, audioBuffer, chunks, genre, concurrency);

  const totalTerms = results.reduce((sum, r) => sum + r.terms.length, 0);
  const hasFailures = results.some(r => r.confidence === 'low' && r.terms.length === 0);

  return {
    results,
    totalTerms,
    hasFailures,
    glossaryChunks: chunks
  };
};

// --- GLOSSARY STATE MANAGER ---
/**
 * Non-blocking glossary state manager for parallel chunk processing.
 * Allows individual chunks to independently wait for glossary confirmation
 * without blocking other chunks in the pipeline.
 */
class GlossaryState {
  private promise: Promise<GlossaryItem[]>;
  private resolved = false;
  private glossary: GlossaryItem[] = [];

  constructor(glossaryPromise: Promise<GlossaryItem[]>) {
    this.promise = glossaryPromise.then(g => {
      this.glossary = g;
      this.resolved = true;
      logger.info("✅ GlossaryState: Glossary resolved", { termCount: g.length });
      return g;
    }).catch(e => {
      logger.error("❌ GlossaryState: Glossary promise rejected", e);
      this.glossary = [];
      this.resolved = true;
      return [];
    });
  }

  /**
   * Get the glossary. Returns immediately if already resolved,
   * otherwise waits for the promise to resolve.
   */
  async get(): Promise<GlossaryItem[]> {
    if (this.resolved) {
      return this.glossary;
    }
    return this.promise;
  }

  /**
   * Check if glossary is ready (non-blocking check).
   */
  isReady(): boolean {
    return this.resolved;
  }
}

// --- MAIN FUNCTIONS ---

export const generateSubtitles = async (
  file: File,
  duration: number,
  settings: AppSettings,
  onProgress?: (update: ChunkStatus) => void,
  onIntermediateResult?: (subs: SubtitleItem[]) => void,
  onGlossaryReady?: (metadata: GlossaryExtractionMetadata) => Promise<GlossaryItem[]>
): Promise<{ subtitles: SubtitleItem[], glossaryResults?: GlossaryExtractionResult[] }> => {

  const geminiKey = (typeof window !== 'undefined' ? (window as any).env?.GEMINI_API_KEY : undefined) || settings.geminiKey?.trim() || process.env.API_KEY || process.env.GEMINI_API_KEY;
  const openaiKey = (typeof window !== 'undefined' ? (window as any).env?.OPENAI_API_KEY : undefined) || settings.openaiKey?.trim() || process.env.OPENAI_API_KEY;

  if (!geminiKey) throw new Error("Gemini API Key is missing.");
  if (!openaiKey) throw new Error("OpenAI API Key is missing.");

  const ai = new GoogleGenAI({
    apiKey: geminiKey,
    httpOptions: settings.geminiEndpoint ? { baseUrl: settings.geminiEndpoint } : undefined
  });

  // 1. Decode Audio
  onProgress?.({ id: 'decoding', total: 1, status: 'processing', message: "Decoding audio track..." });
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await decodeAudioWithRetry(file);
    onProgress?.({ id: 'decoding', total: 1, status: 'completed', message: `Audio decoded. Duration: ${formatTime(audioBuffer.duration)}` });
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
    onProgress?.({ id: 'segmenting', total: 1, status: 'processing', message: "Analyzing audio for smart segmentation..." });
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
    onProgress?.({ id: 'segmenting', total: 1, status: 'completed', message: `Smart split created ${segments.length} chunks.` });
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


  const concurrency = settings.concurrencyFlash || 5;

  // --- GLOSSARY EXTRACTION (Parallel) ---
  let glossaryPromise: Promise<GlossaryExtractionResult[]> | null = null;
  let glossaryChunks: { index: number; start: number; end: number }[] | undefined;

  if (settings.enableAutoGlossary !== false) {
    const sampleMinutes = settings.glossarySampleMinutes || 'all';
    glossaryChunks = selectChunksByDuration(chunksParams, sampleMinutes, chunkDuration);

    logger.info(`Initiating parallel glossary extraction on ${glossaryChunks.length} chunks (Limit: ${sampleMinutes} min)`);

    // Use Pro concurrency setting for glossary (Gemini 3 Pro)
    const glossaryConcurrency = settings.concurrencyPro || 2;

    onProgress?.({ id: 'glossary', total: glossaryChunks.length, status: 'processing', message: `Extracting terms (0/${glossaryChunks.length})...` });

    glossaryPromise = extractGlossaryFromAudio(
      ai,
      audioBuffer,
      glossaryChunks,
      settings.genre,
      glossaryConcurrency,
      (completed, total) => {
        onProgress?.({
          id: 'glossary',
          total: total,
          status: completed === total ? 'completed' : 'processing',
          message: completed === total ? 'Glossary extraction complete.' : `Extracting terms (${completed}/${total})...`
        });
      }
    );
  }

  // --- GLOSSARY HANDLING (Parallel to chunk processing) ---
  // Task: Extract glossary terms and wait for user confirmation
  let glossaryHandlingPromise: Promise<GlossaryItem[]>;
  let extractedGlossaryResults: GlossaryExtractionResult[] | undefined;

  if (glossaryPromise) {
    glossaryHandlingPromise = (async () => {
      let finalGlossary = settings.glossary || [];

      try {
        logger.info("Waiting for glossary extraction...");
        onProgress?.({ id: 'glossary', total: 1, status: 'processing', message: 'Finalizing glossary...' });

        extractedGlossaryResults = await glossaryPromise;

        // Calculate metadata for UI decision making
        const totalTerms = extractedGlossaryResults.reduce((sum, r) => sum + r.terms.length, 0);
        const hasFailures = extractedGlossaryResults.some(r => r.confidence === 'low' && r.terms.length === 0);

        if (onGlossaryReady && (totalTerms > 0 || hasFailures)) {
          logger.info("Glossary extracted, waiting for user confirmation...", {
            totalTerms,
            hasFailures,
            resultsCount: extractedGlossaryResults.length,
            results: extractedGlossaryResults.map(r => ({ idx: r.chunkIndex, terms: r.terms.length, conf: r.confidence }))
          });
          onProgress?.({ id: 'glossary', total: 1, status: 'processing', message: 'Waiting for user review...' });

          // BLOCKING CALL (User Interaction) - Pass metadata for UI
          logger.info("Calling onGlossaryReady with metadata...");

          const confirmationPromise = onGlossaryReady({
            results: extractedGlossaryResults,
            totalTerms,
            hasFailures,
            glossaryChunks
          });

          // Wait indefinitely for user confirmation (no timeout)
          finalGlossary = await confirmationPromise;
          logger.info("onGlossaryReady returned.");

          logger.info("Glossary confirmed/updated.", { count: finalGlossary.length });
          onProgress?.({ id: 'glossary', total: 1, status: 'completed', message: 'Glossary applied.' });
        } else {
          // No callback or truly empty results (not even failures)
          logger.info("No glossary extraction needed", { totalTerms, hasFailures });
          onProgress?.({ id: 'glossary', total: 1, status: 'completed', message: 'No terms found.' });
        }
      } catch (e) {
        logger.warn("Glossary extraction failed or timed out", e);
        onProgress?.({ id: 'glossary', total: 1, status: 'error', message: 'Glossary failed' });
      }

      return finalGlossary; // Return only the glossary, not a complex object
    })();
  } else {
    // No glossary extraction configured
    glossaryHandlingPromise = Promise.resolve(settings.glossary || []);
  }

  // Wrap glossary promise with GlossaryState for non-blocking access
  const glossaryState = new GlossaryState(glossaryHandlingPromise);
  logger.info("🔄 GlossaryState created - chunks can now access glossary independently");

  // --- UNIFIED PARALLEL PIPELINE: Transcription → Wait for Glossary → Refine & Translate ---
  // Each chunk proceeds independently without waiting for others
  logger.info("Starting Unified Pipeline: Each chunk will proceed independently");

  const chunkResults: SubtitleItem[][] = new Array(totalChunks).fill([]);

  await mapInParallel(chunksParams, concurrency, async (chunk, i) => {
    const { index, start, end } = chunk;

    try {
      // ===== STEP 1: TRANSCRIPTION =====
      onProgress?.({ id: index, total: totalChunks, status: 'processing', stage: 'transcribing', message: 'Transcribing...' });
      logger.debug(`[Chunk ${index}] Starting transcription...`);

      const wavBlob = await sliceAudioBuffer(audioBuffer, start, end);
      const rawSegments = await transcribeAudio(wavBlob, openaiKey, settings.transcriptionModel);

      logger.debug(`[Chunk ${index}] Transcription complete. Segments: ${rawSegments.length}`);

      // Skip if no segments
      if (rawSegments.length === 0) {
        logger.warn(`[Chunk ${index}] No speech detected, skipping`);
        chunkResults[i] = [];
        onProgress?.({ id: index, total: totalChunks, status: 'completed', message: 'Done (Empty)' });
        return;
      }

      // ===== STEP 2: WAIT FOR GLOSSARY (Non-blocking for other chunks) =====
      onProgress?.({ id: index, total: totalChunks, status: 'processing', stage: 'waiting_glossary', message: 'Waiting for glossary...' });
      logger.debug(`[Chunk ${index}] Waiting for glossary confirmation...`);

      const finalGlossary = await glossaryState.get();
      const chunkSettings = { ...settings, glossary: finalGlossary };

      logger.debug(`[Chunk ${index}] Glossary ready (${finalGlossary.length} terms), proceeding to refinement`);

      // ===== STEP 3: REFINEMENT =====
      // Re-slice audio for Gemini (Refine needs audio)
      const refineWavBlob = await sliceAudioBuffer(audioBuffer, start, end);
      const base64Audio = await blobToBase64(refineWavBlob);

      let refinedSegments: SubtitleItem[] = [];
      onProgress?.({ id: index, total: totalChunks, status: 'processing', stage: 'refining', message: 'Refining...' });

      const refineSystemInstruction = getSystemInstruction(chunkSettings.genre, undefined, 'refinement', chunkSettings.glossary);
      const glossaryInfo = chunkSettings.glossary && chunkSettings.glossary.length > 0
        ? `\n\nKEY TERMINOLOGY (Ensure these terms are spelled correctly in the transcription if heard):\n${chunkSettings.glossary.map(g => `- ${g.term}${g.notes ? ` (${g.notes})` : ''}`).join('\n')}`
        : '';

      const refinePrompt = `
        TRANSCRIPTION REFINEMENT TASK
        Context: ${chunkSettings.genre}

        TASK: Refine the raw OpenAI Whisper transcription by listening to the audio and correcting errors.

        RULES (Priority Order):

        [P1 - ACCURACY] Audio-Based Correction
        → Listen carefully to the attached audio
        → Fix misrecognized words and phrases in 'text'
        → Verify timing accuracy of 'start' and 'end' timestamps
        ${glossaryInfo ? `→ Pay special attention to key terminology listed below` : ''}

        [P2 - READABILITY] Segment Splitting
        → SPLIT any segment longer than 4 seconds OR >25 characters
        → When splitting: distribute timing based on actual audio speech
        → Ensure splits occur at natural speech breaks
        
        [P3 - CLEANING] Remove Non-Speech Elements
        → Remove filler words (uh, um, 呃, 嗯, etc.)
        → Remove stuttering and false starts
        → Keep natural speech flow

        [P4 - OUTPUT] Format Requirements
        → Return timestamps in HH:MM:SS,mmm format
        → Timestamps must be relative to the provided audio (starting at 00:00:00,000)
        → Ensure all required fields are present

        FINAL VERIFICATION:
        ✓ Long segments (>4s or >25 chars) properly split
        ✓ Timestamps are relative to chunk start
        ✓ Terminology from glossary is used correctly
        ${glossaryInfo ? `✓ Checked against ${chunkSettings.glossary?.length} glossary terms` : ''}

        Input Transcription (JSON):
        ${JSON.stringify(rawSegments.map(s => ({ start: s.startTime, end: s.endTime, text: s.original })))}
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
      } catch (e) {
        logger.error(`Refinement failed for chunk ${index}, falling back to raw.`, e);
        refinedSegments = [...rawSegments];
      }

      // ===== STEP 4: TRANSLATION =====
      let finalChunkSubs: SubtitleItem[] = [];
      if (refinedSegments.length > 0) {
        onProgress?.({ id: index, total: totalChunks, status: 'processing', stage: 'translating', message: 'Translating...' });

        const toTranslate = refinedSegments.map((seg, idx) => ({
          id: idx + 1,
          original: seg.original,
          start: seg.startTime,
          end: seg.endTime
        }));

        const translateSystemInstruction = getSystemInstruction(chunkSettings.genre, chunkSettings.customTranslationPrompt, 'translation', chunkSettings.glossary);

        const translatedItems = await translateBatch(
          ai,
          toTranslate,
          translateSystemInstruction,
          concurrency,
          chunkSettings.translationBatchSize || 20,
          (update) => onProgress?.({ id: index, total: totalChunks, status: 'processing', stage: 'translating', ...update })
        );
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
      const currentAll = chunkResults.flat().map((s, idx) => ({ ...s, id: idx + 1 }));
      onIntermediateResult?.(currentAll);

      onProgress?.({ id: index, total: totalChunks, status: 'completed', message: 'Done' });

    } catch (e: any) {
      logger.error(`Phase 3 failed for chunk ${index}`, e);
      onProgress?.({ id: index, total: totalChunks, status: 'error', message: 'Failed' });
      throw e;
    }
  });

  const finalSubtitles = chunkResults.flat().map((s, idx) => ({ ...s, id: idx + 1 }));

  return { subtitles: finalSubtitles, glossaryResults: extractedGlossaryResults };
};

// --- HELPERS ---

async function processTranslationBatchWithRetry(
  ai: GoogleGenAI,
  batch: any[],
  systemInstruction: string,
  maxRetries = 3,
  onStatusUpdate?: (update: { toast: { message: string, type: 'info' | 'warning' | 'error' | 'success' } }) => void
): Promise<any[]> {
  const payload = batch.map(item => ({ id: item.id, text: item.original }));

  const prompt = `
    TRANSLATION BATCH TASK
    
    TASK: Translate ${batch.length} subtitle segments to Simplified Chinese.
    
    RULES (Priority Order):
    
    [P1 - ACCURACY] Complete and Accurate Translation
    → Translate all ${batch.length} items (one-to-one mapping with input IDs)
    → Ensure no meaning is lost from source text
    → ID matching is critical - do not skip any ID
    → Output exactly ${batch.length} items in the response
    
    [P2 - QUALITY] Translation Excellence
    → Remove filler words and stuttering (uh, um, 呃, 嗯, etc.)
    → Produce fluent, natural Simplified Chinese
    → Use terminology from system instruction if provided
    → Maintain appropriate tone and style
    
    [P3 - OUTPUT] Format Requirements
    → 'text_translated' MUST BE in Simplified Chinese
    → Never output English, Japanese, or other languages in 'text_translated'
    → Maintain exact ID values from input
    
    FINAL VERIFICATION:
    ✓ All ${batch.length} IDs present in output
    ✓ All translations are Simplified Chinese
    ✓ No meaning lost from original text
    ✓ Filler words removed
    
    Input JSON:
    ${JSON.stringify(payload)}
    `;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
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
        logger.warn(`Translation JSON parse error (Attempt ${attempt + 1}/${maxRetries})`);
        throw e;
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
      if (attempt < maxRetries - 1) {
        logger.warn(`Translation batch failed (Attempt ${attempt + 1}/${maxRetries}). Retrying entire batch...`, e);
        onStatusUpdate?.({
          toast: {
            message: `Translation batch failed (Attempt ${attempt + 1}/${maxRetries}). Retrying...`,
            type: 'warning'
          }
        });
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      } else {
        logger.error(`Translation batch failed after ${maxRetries} attempts`, e);
        onStatusUpdate?.({
          toast: {
            message: `Translation batch failed after ${maxRetries} attempts. Using original text.`,
            type: 'error'
          }
        });
      }
    }
  }

  return batch.map(item => ({ ...item, translated: item.original }));
}

async function translateBatch(
  ai: GoogleGenAI,
  items: any[],
  systemInstruction: string,
  concurrency: number,
  batchSize: number,
  onStatusUpdate?: (update: { toast: { message: string, type: 'info' | 'warning' | 'error' | 'success' } }) => void
): Promise<any[]> {
  const batches: any[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }

  const batchResults = await mapInParallel(batches, concurrency, async (batch) => {
    return await processTranslationBatchWithRetry(ai, batch, systemInstruction, 3, onStatusUpdate);
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

  // Construct Glossary Context
  let glossaryContext = "";
  if (settings.glossary && settings.glossary.length > 0) {
    glossaryContext = `
    GLOSSARY (Strictly adhere to these terms):
    ${settings.glossary.map(g => `- ${g.term}: ${g.translation} ${g.notes ? `(${g.notes})` : ''}`).join('\n')}
    `;
    logger.info(`[Batch ${batchLabel}] Using glossary with ${settings.glossary.length} terms.`);
  }


  if (mode === 'fix_timestamps') {
    prompt = `
    Batch ${batchLabel}.
    TIMESTAMP ALIGNMENT & SEGMENTATION TASK
    Previous batch ended at: "${lastEndTime}"
    ${glossaryContext}
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
    ${glossaryContext}
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
    
    [P3 - ABSOLUTE] Timestamp Preservation
    → DO NOT modify timestamps of existing subtitles
    → Exception: When adding NEW entries for missed speech, assign appropriate timestamps
    → Even if existing lines are very long → LEAVE their timing unchanged
    → Your job is TRANSLATION quality, not timing adjustment
    
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
    // Proofread -> Gemini 3 Pro (Best quality) + Search Grounding
    // Fix Timestamps / Retranslate -> Gemini 2.5 Flash (Fast/Efficient)
    const model = mode === 'proofread' ? 'gemini-3-pro-preview' : 'gemini-2.5-flash';
    const tools = mode === 'proofread' ? [{ googleSearch: {} }] : undefined;

    // Use the new Long Output handler
    const text = await generateContentWithLongOutput(
      ai,
      model,
      systemInstruction,
      parts,
      BATCH_SCHEMA, // Use the new schema
      tools // Enable Search Grounding for proofread
    );


    let processedBatch = parseGeminiResponse(text, totalVideoDuration);

    if (processedBatch.length > 0) {
      // Heuristic: Detect if Gemini returned relative timestamps (starting from ~0) or absolute
      // We explicitly asked for relative (0-based) in the prompt.
      // However, models sometimes ignore this and return absolute timestamps if the input had them.

      const firstStart = timeToSeconds(processedBatch[0].startTime);
      const expectedRelativeStart = 0; // We asked for 0-based
      const expectedAbsoluteStart = startSec; // The actual start time in the video

      const diffRelative = Math.abs(firstStart - expectedRelativeStart);
      const diffAbsolute = Math.abs(firstStart - expectedAbsoluteStart);

      // If the result is closer to 0 than to the absolute start, it's likely relative.
      // If audioOffset is 0 (start of video), diffRelative == diffAbsolute, so we don't need to add offset.
      if (audioOffset > 0 && diffRelative < diffAbsolute) {
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

    try {
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
    } catch (e) {
      logger.error(`Batch ${groupLabel} failed`, e);
      onProgress?.({
        id: groupLabel,
        total: groups.length,
        status: 'error',
        message: 'Failed',
        toast: { message: `Batch ${groupLabel} failed: ${(e as Error).message}`, type: 'error' }
      });
      // We do NOT re-throw here. This ensures other batches can continue.
      // The chunks for this batch remain as they were (original subtitles), effectively acting as a fallback.
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
      model: 'gemini-3-pro-preview',
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.3,
        maxOutputTokens: 65536,
        tools: [{ googleSearch: {} }],
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
