import { BatchOperationMode, GlossaryItem } from "./types";

// --- Helper Functions ---

/**
 * Get genre-specific guidance for prompts
 */
function getGenreSpecificGuidance(genre: string): string {
    switch (genre) {
        case 'anime':
            return `\nGENRE-SPECIFIC NOTES:\n- Preserve emotional nuances and character personality\n- Keep honorifics (-san, -kun, -chan) appropriately\n- Use casual, emotive tone in translation`;
        case 'movie':
            return `\nGENRE-SPECIFIC NOTES:\n- Natural dialogue flow is critical\n- Keep subtitles concise and easy to read\n- Match the tone and pacing of the scene`;
        case 'news':
            return `\nGENRE-SPECIFIC NOTES:\n- Maintain formal, objective tone\n- Use standard news terminology\n- Accuracy is paramount`;
        case 'tech':
            return `\nGENRE-SPECIFIC NOTES:\n- Keep technical terms precise\n- Preserve standard English acronyms (API, SDK, etc.)\n- Ensure terminology consistency`;
        case 'general':
            return `\nGENRE-SPECIFIC NOTES:\n- Neutral and accurate translation\n- Clear, accessible language`;
        default:
            return `\nGENRE-SPECIFIC NOTES:\n- Adapt tone and terminology for ${genre} content`;
    }
}

export const getSystemInstruction = (
    genre: string,
    customPrompt: string | undefined,
    mode: 'refinement' | 'translation' | 'proofread' | 'fix_timestamps' = 'translation',
    glossary?: GlossaryItem[]
): string => {

    // Helper to format glossary
    const glossaryText = glossary && glossary.length > 0
        ? `\n\nTERMINOLOGY GLOSSARY (STRICTLY FOLLOW):\n${glossary.map(g => `- ${g.term}: ${g.translation} ${g.notes ? `(${g.notes})` : ''}`).join('\n')}`
        : '';

    // If custom prompt is provided, usually we prepend/mix it, but for simplicity if a user overrides "Proofreading Prompt", we use it for "Deep Proofread" mode.
    if (mode === 'proofread' && customPrompt && customPrompt.trim().length > 0) {
        return customPrompt + glossaryText;
    }
    // We allow custom prompt override for translation phase too
    if (mode === 'translation' && customPrompt && customPrompt.trim().length > 0) {
        return customPrompt + glossaryText;
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
    
    Genre Context: ${genre}${glossaryText}`;
    }

    // 2. Translation Prompt (Flash 2.5) - Initial Pass
    if (mode === 'translation') {
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
    5. **TERMINOLOGY**: Use the provided glossary for specific terms.
    6. FINAL CHECK: Before outputting, strictly verify that ALL previous rules (1-5) have been perfectly followed. Correct any remaining errors.
    ${genreContext}${glossaryText}`;
    }

    // 3. Fix Timestamps Prompt (Flash 2.5)
    if (mode === 'fix_timestamps') {
        return `You are a Subtitle Timing and Synchronization Specialist.
      Your PRIMARY GOAL is to perfect timestamp alignment and segment timing for ${genre} content.
      
      TASK RULES (Strict Priority):
      
      [P0 - HIGHEST] User Directives
      → If a subtitle has a "comment" field, follow that instruction exactly
      → User corrections override all other rules
      
      [P1 - PRIMARY FOCUS] Timestamp Alignment
      → Listen to audio and align start/end times to actual speech boundaries
      → Ensure timestamps are strictly within the provided audio duration
      → Timestamps must be relative to provided audio file (starting at 00:00:00)
      → Fix timing drift and bunched-up segments
      
      [P2 - READABILITY] Segment Splitting
      → SPLIT any segment longer than 4 seconds OR >25 Chinese characters
      → When splitting: distribute timing proportionally based on audio
      → Ensure natural speech breaks between split segments
      
      [P3 - CONTENT ACCURACY] Audio Content Verification
      → If you hear speech NOT in subtitles → ADD new subtitle entries
      → Remove filler words from 'text_original' (uh, um, 呃, 嗯, etc.)
      
      [P4 - ABSOLUTE RULE] Translation Preservation
      → DO NOT modify 'text_translated' field under ANY circumstances
      → Even if the translation is wrong, in English, or nonsensical → LEAVE IT
      → Your job is TIMING, not translation quality
      → Translation fixes belong in the Proofread function
      
      OUTPUT REQUIREMENTS:
      ✓ Valid JSON matching input structure
      ✓ Preserve all IDs (assign new IDs only for inserted/split segments)
      ✓ All timestamps in HH:MM:SS,mmm format
      ✓ Ensure start < end for all segments
      
      FINAL QUALITY CHECK:
      Before returning, verify:
      ✓ All timestamps aligned to audio speech
      ✓ Long segments properly split
      ✓ No missed speech from audio
      ✓ 'text_translated' completely unchanged from input
      
      Context: ${genre}`;
    }

    return `You are an expert Subtitle Translation Quality Specialist using Gemini 3 Pro.
    Your PRIMARY GOAL is to perfect the Chinese translation quality for ${genre} content.
    
    TASK RULES (Strict Priority):
    
    [P0 - HIGHEST] User Directives
    → If a subtitle has a "comment" field, follow that instruction exactly
    → User corrections override all other rules
    
    [P1 - PRIMARY FOCUS] Translation Quality Improvement
    → Fix mistranslations and missed meanings
    → Improve awkward or unnatural Chinese phrasing
    → Ensure ALL 'text_translated' fields are Simplified Chinese (never English, Japanese, or other languages)
    → Apply glossary terms consistently
    → Verify translation captures the full intent of 'text_original'
    
    [P2 - CONTENT ACCURACY] Audio Verification
    → Listen to audio carefully
    → If you hear speech NOT in the subtitles → ADD new subtitle entries
    → Verify 'text_original' matches what was actually said
    
    [P3 - ABSOLUTE] Timestamp Preservation
    → DO NOT modify timestamps of existing subtitles
    → Exception: When adding NEW entries for missed speech, assign appropriate timestamps
    → Even if existing lines are very long → LEAVE their timing unchanged
    → Your job is TRANSLATION quality, not timing adjustment
    
    [P4 - LOWEST] Preservation Principle
    → For subtitles WITHOUT user comments: preserve them unless there's a clear translation error
    
    OUTPUT REQUIREMENTS:
    ✓ Valid JSON matching input structure
    ✓ Preserve IDs (assign new sequential IDs only when inserting new subtitles)
    ✓ All timestamps in HH:MM:SS,mmm format
    
    FINAL QUALITY CHECK:
    Before returning, verify:
    ✓ All user comments addressed
    ✓ All 'text_translated' are fluent Simplified Chinese
    ✓ No missed speech from audio
    ✓ Translation quality significantly improved
    ${getGenreSpecificGuidance(genre)}${glossaryText}`;
};

export const GLOSSARY_EXTRACTION_PROMPT = (genre: string) => `
TERMINOLOGY EXTRACTION TASK
Genre Context: ${genre}

TASK: Extract key terminology from the audio that requires consistent translation across subtitles.

RULES (Priority Order):

[P0 - CRITICAL] Language Detection and Matching
→ **FIRST**: Detect the PRIMARY LANGUAGE spoken in this audio segment
→ **SECOND**: Extract ONLY terms that are spoken in that detected language
→ **ABSOLUTE RULE**: DO NOT extract terms in other languages
→ Examples for Japanese audio:
  • If speaker says "釜山" (Busan), extract "釜山" NOT "Busan"
  • If speaker says "スカイスキャナー", extract "スカイスキャナー" NOT "Skyscanner"
→ Examples for English audio:
  • If speaker says "Tokyo", extract "Tokyo" NOT "東京"
  • If speaker says "Microsoft", extract "Microsoft" NOT "微软"
→ **CRITICAL**: Listen to what is ACTUALLY SAID, not what you think the translation equivalent is

[P1 - EXTRACTION] Identify Key Terms in Audio Language
→ Listen carefully to the audio
→ Extract names (people, characters, organizations) AS SPOKEN
→ Extract places (locations, venues, regions) AS SPOKEN
→ Extract specialized terms (technical jargon, domain-specific vocabulary) AS SPOKEN
→ Extract recurring phrases that need consistent translation
→ ONLY include terms that ACTUALLY APPEAR in this audio segment

[P2 - TRANSLATION] Provide Accurate Translations
→ Translate all terms to Simplified Chinese
→ For names: Use standard transliterations (e.g., "Alice" → "艾丽丝", "釜山" → "釜山")
→ For technical terms: Use established industry translations
→ Use Google Search to verify standard translations when uncertain
→ Ensure translations are appropriate for ${genre} content

[P3 - ANNOTATION] Add Context When Needed
→ Add notes for ambiguous terms or pronunciation guidance
→ Include context that helps maintain translation consistency
→ Note any special handling requirements

[P4 - QUALITY] Focus on Consistency-Critical Terms
→ Prioritize terms that will appear multiple times
→ Skip common words that don't need special handling
→ Focus on terms where inconsistent translation would be problematic

OUTPUT FORMAT:
→ JSON array of objects
→ Each object: {term: string, translation: string, notes?: string}
→ "term" field MUST be in the ORIGINAL LANGUAGE spoken in audio
→ Return empty array [] if no significant terms found

FINAL VERIFICATION:
✓ Detected audio language correctly
✓ All "term" values are in the SAME LANGUAGE as the audio (NOT English unless audio is English)
✓ All extracted terms actually appear in the audio AS SPOKEN
✓ All translations are in Simplified Chinese
✓ Translations verified with search when needed
✓ Only included terms that need consistent translation
✓ Notes added where helpful for consistency
`;

