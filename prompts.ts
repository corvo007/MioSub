import { BatchOperationMode } from "./types";

export const getSystemInstruction = (
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
    8. FINAL CHECK: Before outputting, strictly verify that ALL previous rules (1-7) have been perfectly followed. Correct any remaining errors.
    
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
    5. FINAL CHECK: Before outputting, strictly verify that ALL previous rules (1-4) have been perfectly followed. Correct any remaining errors.
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
    10. **REDISTRIBUTE**: If you find the input text is "bunched up" or compressed into a short time while the audio continues, YOU MUST SPREAD IT OUT to match the actual speech timing.
    11. **FINAL CHECK**: Before outputting, strictly verify that ALL previous rules (1-10) have been perfectly followed. Correct any remaining errors.
    12. Return valid JSON matching input structure.`;
};
