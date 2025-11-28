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
    
    [P3 - SUPPORTING] Timestamp Adjustments (When Necessary for Translation)
    → You MAY adjust timestamps if needed to support better translation
    → Example: If improving translation requires merging/splitting segments, do it
    → Keep timestamps within the provided audio range
    → Ensure start < end for all segments
    
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

// --- Quality Control Prompts ---

export const QC_REVIEW_PROMPT = (genre: string): string => {
    return `You are an expert Subtitle Quality Analyst using advanced AI models.

Your task is to REVIEW subtitles against audio and identify ALL quality issues, INCLUDING GLOBAL CONSISTENCY.

**IMPORTANT**: Be precise and avoid false positives. Only report actual issues you can confirm by listening to the audio or observing the text.

CATEGORIES OF ISSUES:
1. **Timing Misalignment**: Subtitles appearing too early or too late compared to speech
   - High severity: >500ms off, completely wrong timing
   - Medium severity: 100-500ms off
   - Low severity: <100ms off

2. **Missing Content**: Speech present in audio but NOT in the subtitle text
   - High severity: Missing entire sentences or key phrases
   - Medium severity: Missing minor phrases that affect meaning
   - Low severity: Missing filler words or redundant phrases (Note: fillers should usually be omitted)

3. **Incorrect Translation**: Translation doesn't match the original meaning (for bilingual subtitles)
   - High severity: Completely wrong meaning, major mistranslation
   - Medium severity: Partially incorrect, nuance lost
   - Low severity: Minor word choice issues, style problems

4. **Sync Errors**: Timing distribution issues
   - Subtitles bunched up when audio is spread out
   - Subtitles too spread out when audio is compact

5. **Global Consistency**: Terminology, Tone, and Style issues
   - **Inconsistent Terminology**: The same name, place, or technical term translated differently across segments.
   - **Tone Mismatches**: Sudden shifts in formality (e.g., polite to rude) without context.
   - **Stylistic Inconsistencies**: Mixing different translation styles (e.g., literal vs. liberal).

Context: ${genre}
${getGenreSpecificGuidance(genre)}`;
};

export const QC_FIX_PROMPT = (genre: string, issues: any[]): string => {
    const highSeverityCount = issues.filter(i => i.severity === 'high').length;
    const priorityNote = highSeverityCount > 0
        ? `\n**PRIORITY**: Focus on fixing the ${highSeverityCount} HIGH severity issues first.`
        : '';

    // Sort issues by severity for better processing
    const sortedIssues = [...issues].sort((a, b) => {
        const severityOrder = { high: 0, medium: 1, low: 2 };
        return (severityOrder[a.severity as keyof typeof severityOrder] || 3) -
            (severityOrder[b.severity as keyof typeof severityOrder] || 3);
    });

    return `You are an expert Subtitle Editor.
Your goal is to FIX the identified issues in the subtitles.

KEY RULES:
1. **SURGICAL EDITS**: Do NOT change subtitles unless fixing a listed issue
2. **MAINTAIN STRUCTURE**: Keep all subtitle IDs exactly as they are (unless splitting/inserting)
3. **TIMING VALIDITY**: Ensure startTime < endTime for all subtitles. Timestamps MUST be relative to the start of the provided audio file (starting at 00:00:00).
4. **LANGUAGE**: "text_translated" MUST BE in Simplified Chinese
5. **SPLITTING**: If splitting a subtitle, assign new sequential IDs
6. **INSERTION**: If audio contains missed content, INSERT new subtitle entries with new IDs
7. **UNFIXABLE ISSUES**: If an issue cannot be fixed (e.g., audio quality too poor), preserve the original and note it
8. **CONSISTENCY**: Ensure fixed terms match the dominant terminology in the file.
${priorityNote}

Context: ${genre}
${getGenreSpecificGuidance(genre)}

ISSUES TO FIX (${issues.length} total, sorted by severity):
${sortedIssues.map((i, idx) => `${idx + 1}. [${i.severity.toUpperCase()}] ${i.type}: ${i.description} (Segment ID: ${i.segmentId || 'N/A'}, Time: ${i.timestamp || 'N/A'})`).join('\n')}
`;
};

export const QC_VALIDATE_PROMPT = (genre: string, originalIssues: any[]): string => {
    return `You are a final Quality Validator.

A previous AI model attempted to fix issues. Your job is to:
1. Listen to the audio carefully
2. For EACH original issue, determine if it was ACTUALLY FIXED (100% resolved)
3. Identify any NEW issues introduced during the fix
4. Be STRICT: "Partially fixed" = NOT RESOLVED

RESOLUTION CRITERIA:
- **Resolved**: The issue is completely fixed, no trace of the problem remains
- **Unresolved**: The issue still exists, even partially, or was not addressed
- **New Issue**: A new problem was introduced that didn't exist before

Context: ${genre}
${getGenreSpecificGuidance(genre)}

ORIGINAL ISSUES (${originalIssues.length} total):
${originalIssues.map((i, idx) => `${idx + 1}. ID: ${i.id} - [${i.severity.toUpperCase()}] ${i.type}: ${i.description} (Segment: ${i.segmentId || 'N/A'}, Time: ${i.timestamp || 'N/A'})`).join('\n')}

For each issue ID above, determine if it was resolved or not.
Also scan for any NEW problems introduced during the fix.
`;
};
