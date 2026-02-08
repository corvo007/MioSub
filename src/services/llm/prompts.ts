import { type GlossaryItem } from '@/types/glossary';
import { toLanguageName } from '@/services/utils/language';
import { type SpeakerProfile } from '@/services/generation/extractors/speakerProfile';
import { formatTime } from '@/services/subtitle/time';
import { type RefinementPayload } from '@/services/subtitle/payloads';
import { STEP_CONFIGS, type StepName } from '@/config/models';
import {
  MAX_SEGMENT_DURATION_SECONDS,
  SUBTITLE_MAX_WIDTH,
  FILLER_WORDS,
  SENIOR_MODEL_NAME,
} from '@/config';

// --- Constants ---

/** Filler words formatted for prompt inclusion */
const FILLER_WORDS_PROMPT = FILLER_WORDS.join(', ');

// --- Search Enhancement Prompts ---

/**
 * Check if search is enabled for a specific step
 */
function isSearchEnabled(step: StepName): boolean {
  return STEP_CONFIGS[step]?.useSearch === true;
}

/**
 * Get search-enhanced prompt section for translation tasks
 * Returns sub-items to be appended under the translation quality rule
 * NOTE: Glossary terms have absolute priority - search is only for terms NOT in glossary
 */
function getSearchEnhancedTranslationPrompt(step: StepName, targetLanguage: string): string {
  const languageName = toLanguageName(targetLanguage);
  if (!isSearchEnabled(step)) return '';
  return `
    → **[SEARCH]** For terms NOT in glossary: use Google Search to verify standard ${languageName} translations for proper nouns, names, and places.
    → **[SEARCH]** Search for cultural references, idioms, or slang to find natural ${languageName} equivalents (glossary terms always take priority).
    → **[SEARCH]** When unsure about a translation AND it's not in the glossary, search for authoritative sources.`;
}

/**
 * Get search-enhanced prompt section for proofreading tasks
 * Returns sub-items to be appended under the translation quality rule
 * NOTE: Glossary terms have absolute priority - search is only for terms NOT in glossary
 */
function getSearchEnhancedProofreadPrompt(step: StepName, targetLanguage: string): string {
  const languageName = toLanguageName(targetLanguage);
  if (!isSearchEnabled(step)) return '';
  return `
    → **[SEARCH]** For terms NOT in glossary: search to verify ${languageName} translations for names, places, and organizations.
    → **[SEARCH]** Verify specialized terms not covered by glossary (glossary terms always take priority).
    → **[SEARCH]** If a non-glossary translation looks wrong, search to verify and correct it.`;
}

/**
 * Get search-enhanced prompt section for refinement tasks
 * Returns sub-items to be appended under the accuracy rule
 */
function getSearchEnhancedRefinementPrompt(step: StepName): string {
  if (!isSearchEnabled(step)) return '';
  return `
            → **[SEARCH]** Search to verify correct spelling of proper nouns (names, places, brands) not in glossary.
            → **[SEARCH]** Verify specialized terminology and technical jargon heard in audio.`;
}

// --- Helper Functions ---

/**
 * Get standard segment splitting rule text for prompts
 */
function getSegmentSplittingRule(): string {
  return `SPLIT any segment longer than ${MAX_SEGMENT_DURATION_SECONDS} seconds OR >${SUBTITLE_MAX_WIDTH} visual width units (CJK=2, Latin=1)`;
}

/**
 * Get detailed timestamp splitting instructions
 * This ensures AI follows strict rules when splitting segments to preserve timeline accuracy
 */
function getTimestampSplittingInstructions(): string {
  return `
**IF SPLITTING IS NEEDED**, follow these rules exactly:
→ **PRESERVE ORIGINAL BOUNDARIES**: The FIRST split segment starts at original start time, the LAST split segment ends at original end time
→ **NO GAPS, NO OVERLAPS**: Split segments must be perfectly continuous (segment N end = segment N+1 start)
→ **LISTEN TO AUDIO FOR SPLIT TIMING**: Do NOT allocate time proportionally by text length. Instead:
   1. Listen to the actual audio to hear when each phrase/sentence is spoken
   2. Identify natural pauses, breath breaks, or sentence transitions in the audio
   3. Set split timestamps based on ACTUAL speech timing in the audio
   Example (English): Original segment 00:00:00,000 → 00:00:06,000, text "Hello world. How are you today?"
   - If speaker says "Hello world." quickly (1.5s) then pauses, then speaks slowly:
   - Split 1: "Hello world." → 00:00:00,000 → 00:00:01,500 (based on actual audio)
   - Split 2: "How are you today?" → 00:00:01,500 → 00:00:06,000 (based on actual audio)
   Example (Japanese): Original segment 00:00:00,000 → 00:00:05,000, text "今日はいい天気ですね。散歩に行きましょう。"
   - If speaker says "今日はいい天気ですね。" slowly (3s), then quickly says the rest:
   - Split 1: "今日はいい天気ですね。" → 00:00:00,000 → 00:00:03,000 (based on actual audio)
   - Split 2: "散歩に行きましょう。" → 00:00:03,000 → 00:00:05,000 (based on actual audio)
→ **NATURAL BREAKS ONLY**: Split at sentence boundaries, punctuation, or natural pauses - NEVER mid-word or mid-phrase
→ **MINIMUM DURATION**: Each split segment must be at least 0.5 seconds`;
}

/**
 * Get filler words removal rule text
 */
function getFillerWordsRule(): string {
  return `Remove filler words (${FILLER_WORDS_PROMPT})`;
}

/**
 * Format glossary for prompt inclusion
 */
function formatGlossaryForPrompt(
  glossary: GlossaryItem[] | undefined,
  mode: 'refinement' | 'translation' | 'proofread'
): string {
  if (!glossary || glossary.length === 0) return '';

  if (mode === 'refinement') {
    const terms = glossary.map((g) => `- ${g.term}${g.notes ? ` (${g.notes})` : ''}`).join('\n');
    return `\n\nKEY TERMINOLOGY (Listen for these terms and transcribe them accurately in the ORIGINAL LANGUAGE):\n${terms}`;
  }

  const terms = glossary
    .map((g) => `- ${g.term}: ${g.translation} ${g.notes ? `(${g.notes})` : ''}`)
    .join('\n');
  return `\n\nTERMINOLOGY GLOSSARY (STRICTLY FOLLOW):\n${terms}`;
}

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

/**
 * System instruction with optional speaker diarization support
 * Wraps getSystemInstruction and adds diarization instructions when enabled
 */
export const getSystemInstructionWithDiarization = (
  genre: string,
  customPrompt: string | undefined,
  mode: 'refinement' | 'translation' | 'proofread',
  glossary?: GlossaryItem[],
  enableDiarization?: boolean,
  speakerProfiles?: SpeakerProfile[],
  minSpeakers?: number,
  maxSpeakers?: number,
  targetLanguage?: string
): string => {
  // For non-refinement modes or disabled diarization, delegate to original function
  if (mode !== 'refinement' || !enableDiarization) {
    return getSystemInstruction(
      genre,
      customPrompt,
      mode,
      glossary,
      speakerProfiles,
      targetLanguage
    );
  }

  // For refinement with diarization, build custom prompt
  const glossaryText = formatGlossaryForPrompt(glossary, mode);

  let diarizationSection = '';
  if (enableDiarization) {
    // Build speaker count hint (shared by both scenarios)
    let speakerCountHint = '';
    if (minSpeakers && maxSpeakers) {
      speakerCountHint = `\n→ **USER HINT - EXPECTED SPEAKER COUNT**: The user has specified there are between ${minSpeakers} and ${maxSpeakers} speakers.`;
    } else if (minSpeakers) {
      speakerCountHint = `\n→ **USER HINT - EXPECTED SPEAKER COUNT**: The user has specified there are at least ${minSpeakers} speakers.`;
    } else if (maxSpeakers) {
      speakerCountHint = `\n→ **USER HINT - EXPECTED SPEAKER COUNT**: The user has specified there are at most ${maxSpeakers} speakers.`;
    }

    if (speakerProfiles && speakerProfiles.length > 0) {
      // **SCENARIO A: WITH PRE-ANALYZED PROFILES**
      diarizationSection = `
[P2 - SPEAKER IDENTIFICATION] Diarization (ENABLED - WITH PROFILE DATABASE)

**IMPORTANT**: A senior AI (${SENIOR_MODEL_NAME}) has pre-analyzed this audio and identified ${speakerProfiles.length} speakers.
Your task is to MATCH voices to these profiles.${speakerCountHint}

**KNOWN SPEAKER PROFILES**:
${speakerProfiles
  .map(
    (p, i) => `
${i + 1}. **${p.id}**
   - Gender: ${p.characteristics.gender}
   ${p.characteristics.name ? `- Name: ${p.characteristics.name}` : ''}
   - Pitch: ${p.characteristics.pitch}
   - Speed: ${p.characteristics.speed}
   - Accent: ${p.characteristics.accent}
   - Tone: ${p.characteristics.tone}
   ${p.inferredIdentity ? `- Role: ${p.inferredIdentity}` : ''}
   ${p.speakingStyle ? `- Speaking Style: ${p.speakingStyle.formality || ''} ${p.speakingStyle.vocabulary ? `(${p.speakingStyle.vocabulary})` : ''}` : ''}
   ${p.emotionalTone ? `- Emotional Tone: ${p.emotionalTone}` : ''}
   ${p.catchphrases && p.catchphrases.length > 0 ? `- Catchphrases: ${p.catchphrases.map((c) => `"${c}"`).join(', ')}` : ''}
   ${p.speakingContext && p.speakingContext.length > 0 ? `- Speaking Context: ${p.speakingContext.join(', ')}` : ''}
   - Sample Quotes: ${p.sampleQuotes.map((q) => `"${q}"`).join(', ')}
   - Confidence: ${(p.confidence * 100).toFixed(0)}%
`
  )
  .join('\n')}

**MATCHING STRATEGY** (Priority Order):

1. **PRIMARY: Content & Style Matching** (Most Reliable)
   - **Catchphrase Detection**: If the speaker uses any catchphrase from a profile → VERY STRONG match
   - **Sample Quote Similarity**: Compare what is SAID with sample quotes in each profile
   - **Vocabulary Style**: Match vocabulary level (technical/colloquial/formal) with profile's speakingStyle
   - **Topic Alignment**: If speaker discusses topics in a profile's speakingContext → Strong match
   - **Identity Clues**: If content relates to inferredIdentity (e.g., medical terms → Doctor profile)

2. **SECONDARY: Dialogue Context** (Very Helpful)
   - **Conversation Flow**: If previous subtitle was Speaker A asking question → this might be Speaker B answering
   - **Alternation Pattern**: Speakers usually alternate (A→B→A→B)
   - **Continuity**: Multiple consecutive lines with same tone/topic → likely same speaker

3. **TERTIARY: Voice & Emotion** (Use as Confirmation)
   - **Emotional Consistency**: Match emotional tone (enthusiastic/calm) with profile
   - **Gender**: Usually reliable if clearly male/female
   - **Pitch/Speed/Accent**: HINTS only - don't rely heavily

4. **CRITICAL RULE: Consistency**
   - Once assigned, maintain same speaker ID for similar content/style
   - Same voice + same topic + same catchphrases = same speaker

**MATCHING PROCESS**:
For each subtitle line:
→ Step 1: Check for catchphrases from any profile (HIGHEST priority)
→ Step 2: Compare content with sample quotes (exact or similar phrases)
→ Step 3: Check if topic relates to any profile's speakingContext or inferredIdentity
→ Step 4: Consider dialogue context (response pattern, continuity)
→ Step 5: Verify emotional tone and speaking style consistency
→ Step 6: Use voice characteristics as final confirmation
→ Step 7: Assign the best match from the ${speakerProfiles.length} profiles

**EDGE CASE - NEW SPEAKER DISCOVERY**:
If you encounter a voice that does NOT match ANY profile AND you are >90% confident it's a NEW speaker:
- Assign a new ID: "Speaker ${speakerProfiles.length + 1}", "Speaker ${speakerProfiles.length + 2}", etc.
- Add brief characteristics in a comment field (you can use "comment" for this)
- This should be RARE - Gemini 3 Pro is very thorough

**QUALITY VERIFICATION**:
✓ Every subtitle has a "speaker" field
✓ Speaker IDs match profile list (or are justified new additions)
✓ Voice changes are detected and speaker switches occur appropriately
✓ Consistency maintained across the batch
`;
    } else {
      // **SCENARIO B: NO PROFILES (REAL-TIME DETECTION)**
      diarizationSection = `
[P2 - SPEAKER IDENTIFICATION] Audio Diarization
→ **CRITICAL TASK**: Identify and label DISTINCT SPEAKERS in the audio
→ **OUTPUT FORMAT**: Add "speaker" field to EVERY subtitle entry
→ **LABELING**: Use "Speaker 1", "Speaker 2", "Speaker 3", etc.${speakerCountHint}

**VOICE CHARACTERISTICS TO ANALYZE**:
→ Pitch: Fundamental frequency and tonal range
→ Timbre: Voice quality and texture
→ Speaking rate: Words per minute and rhythm
→ Accent or dialect: Regional or linguistic markers
→ Gender: If clearly distinguishable from vocal characteristics

**DIARIZATION RULES**:
→ SAME voice = SAME speaker ID (consistency is critical)
→ If a speaker change occurs mid-segment: SPLIT the segment
→ Single speaker audio: Still label as "Speaker 1"
→ Overlapping speech: Assign to the PRIMARY/LOUDER speaker
→ Background voices: IGNORE unless they are part of main dialogue
→ Narrator vs. character dialogue: Treat as DIFFERENT speakers

**EDGE CASES**:
→ Similar voices: Err on the side of maintaining previous assignment
→ Short interjections: May be same speaker as previous/next segment
→ Phone calls/filtered audio: Use contextual clues and voice patterns

**QUALITY VERIFICATION**:
Before returning, confirm:
✓ Every segment has a "speaker" field
✓ Speaker IDs remain consistent throughout
✓ No speaker changes within a single segment
✓ At least one speaker identified (minimum "Speaker 1")
`;
    }
  }

  // Note: Only refinement mode with diarization enabled reaches this point
  return `You are a professional Subtitle QA Specialist. 
    You will receive an audio chunk and a raw JSON transcription.
    
    YOUR TASKS:
    1. Listen to the audio to verify the transcription.
    2. **CHECK FOR MISSED SPEECH**: If there is CLEAR, MEANINGFUL speech in the audio that is MISSING from the transcription, you MUST ADD IT.
       → Do NOT add: background noise, music lyrics, ambient sounds, or unintelligible mumbling
    3. **ALIGN TIMESTAMPS**: Listen to audio and adjust start/end times to match actual speech boundaries.
       → Whisper timestamps may drift, especially in long audio - correct any misalignment you detect
       → **Timestamps MUST be strictly within the provided audio duration.**
       → **NEVER MERGE** multiple segments into one - only SPLIT long segments when needed
    4. FIX TRANSCRIPTION: Correct mishearings, typos, and proper nouns (names, terminology).
    5. IGNORE FILLERS: Do not transcribe stuttering or meaningless filler words (${FILLER_WORDS_PROMPT}).
    6. SPLIT LINES: STRICT RULE. ${getSegmentSplittingRule()}, YOU MUST SPLIT IT into shorter, natural segments.
    ${getTimestampSplittingInstructions()}
    7. **LANGUAGE RULE**: Keep the transcription in the ORIGINAL LANGUAGE spoken in the audio. DO NOT translate to any other language.
    8. FORMAT: Return a valid JSON array.

    ${diarizationSection}

    9. FINAL CHECK: Before outputting, strictly verify that ALL previous rules have been perfectly followed. Correct any remaining errors.
    
    Genre Context: ${genre}${glossaryText}`;
};

export const getSystemInstruction = (
  genre: string,
  customPrompt: string | undefined,
  mode: 'refinement' | 'translation' | 'proofread' = 'translation',
  glossary?: GlossaryItem[],
  speakerProfiles?: SpeakerProfile[],
  targetLanguage?: string
): string => {
  // Normalize locale codes (e.g. 'zh-CN', 'en') to readable names (e.g. 'Simplified Chinese', 'English')
  targetLanguage = toLanguageName(targetLanguage || 'en');
  // Use helper function to format glossary
  const glossaryText = formatGlossaryForPrompt(glossary, mode);

  // 1. Refinement Prompt (Flash 2.5) - Initial Pass

  if (mode === 'refinement') {
    return `You are a professional Subtitle QA Specialist. 
    You will receive an audio chunk and a raw JSON transcription.
    
    YOUR TASKS:
    1. Listen to the audio to verify the transcription.
    2. **CHECK FOR MISSED SPEECH**: If there is CLEAR, MEANINGFUL speech in the audio that is MISSING from the transcription, you MUST ADD IT.
       → Do NOT add: background noise, music lyrics, ambient sounds, or unintelligible mumbling
    3. **ALIGN TIMESTAMPS**: Listen to audio and adjust start/end times to match actual speech boundaries.
       → Whisper timestamps may drift, especially in long audio - correct any misalignment you detect
       → **Timestamps MUST be strictly within the provided audio duration.**
       → **NEVER MERGE** multiple segments into one - only SPLIT long segments when needed
    4. FIX TRANSCRIPTION: Correct mishearings, typos, and proper nouns (names, terminology).
    5. IGNORE FILLERS: Do not transcribe stuttering or meaningless filler words (${FILLER_WORDS_PROMPT}).
    6. SPLIT LINES: STRICT RULE. ${getSegmentSplittingRule()}, YOU MUST SPLIT IT into shorter, natural segments.
    ${getTimestampSplittingInstructions()}
    7. **LANGUAGE RULE**: Keep the transcription in the ORIGINAL LANGUAGE spoken in the audio. DO NOT translate to any other language.
    8. FORMAT: Return a valid JSON array.
    9. FINAL CHECK: Before outputting, strictly verify that ALL previous rules (1-8) have been perfectly followed. Correct any remaining errors.
    
    ---
    CONTEXT INFORMATION:
    
    Genre: ${genre}${
      customPrompt
        ? `
    
    **USER-PROVIDED INSTRUCTIONS** (Follow these additional guidelines from the user):
    ${customPrompt}`
        : ''
    }${
      glossaryText
        ? `
    ${glossaryText}`
        : ''
    }`;
  }

  // 2. Translation Prompt (Flash 2.5) - Initial Pass
  if (mode === 'translation') {
    let genreContext = '';
    switch (genre) {
      case 'anime':
        genreContext = 'Genre: Anime. Use casual, emotive tone. Preserve honorifics nuances.';
        break;
      case 'movie':
        genreContext = 'Genre: Movie/TV. Natural dialogue, concise, easy to read.';
        break;
      case 'news':
        genreContext = 'Genre: News. Formal, objective, standard terminology.';
        break;
      case 'tech':
        genreContext = 'Genre: Tech. Precise terminology. Keep standard English acronyms.';
        break;
      case 'general':
        genreContext = 'Genre: General. Neutral and accurate.';
        break;
      default:
        genreContext = `Context: ${genre}. Translate using tone/terminology appropriate for this context.`;
        break;
    }

    return `You are an expert Subtitle Translator specializing in ${genre} content.
    Your GOAL is to provide fluent, natural ${targetLanguage} translations while strictly preserving the subtitle structure.

    TASK RULES (Strict Priority):

    [P0 - STRUCTURAL INTEGRITY]
    → **ONE INPUT = ONE OUTPUT**: You must return exactly one translated subtitle for every input subtitle.
    → **ID PRESERVATION**: Maintain the "id" field exactly as provided.
    → **NO MERGING/SPLITTING**: Do not combine multiple lines or split a single line.
    → **TIMESTAMPS**: Do not modify timestamps.

    [P1 - TRANSLATION QUALITY]
    → **FLUENCY**: Translate into natural, written ${targetLanguage}, not "translationese".
    → **CONTEXT AWARENESS**: Use the provided genre context to determine tone and style.
    → **COMPLETENESS**: Ensure every meaningful part of the original text is represented.
    → **NO HALLUCINATIONS**: Do not invent information not present in the source.
    → **MULTI-LINE CONTEXT**: Read the previous and next 1-2 lines to understand context. This helps with:
       - Resolving ambiguous pronouns (e.g., "it", "that")
       - Understanding incomplete sentences split across lines
       - Maintaining consistent tone and terminology across related lines
    → **STRICT BOUNDARY RULE**: Use this context for **UNDERSTANDING** only. **NEVER** merge segments or move text between lines.
    → **PARTIAL SENTENCES**: If a sentence is split across lines, translate ONLY the specific fragment in the current line. Do not "complete" it using text from the next line.${getSearchEnhancedTranslationPrompt('translation', targetLanguage)}

    [P2 - CLEANUP & REFINEMENT]
    → **REMOVE FILLERS**: Ignore stuttering, hesitation, and meaningless fillers (e.g., "uh", "um", "ah", "eto", "ano", "呃", "那个").
    → **CONCISENESS**: Keep subtitles concise and easy to read quickly.

    [P3 - TERMINOLOGY]
    → **GLOSSARY**: Strictly follow the provided glossary for specific terms.
    → **CONSISTENCY**: Maintain consistent terminology for names and places.

    OUTPUT REQUIREMENTS:
    ✓ Valid JSON matching input structure
    ✓ Output count MUST match input count exactly
    ✓ All 'text_translated' fields must be ${targetLanguage}

    FINAL QUALITY CHECK:
    Before returning, verify:
    ✓ Did I return the exact same number of items as the input?
    ✓ Are all IDs preserved?
    ✓ Is the ${targetLanguage} fluent and natural?
    ✓ Did I remove all filler words?

    ---
    CONTEXT INFORMATION:
    ${genreContext}${
      customPrompt
        ? `
    
    **USER-PROVIDED INSTRUCTIONS** (Follow these additional guidelines from the user):
    ${customPrompt}`
        : ''
    }${
      glossaryText
        ? `
    ${glossaryText}`
        : ''
    }${
      speakerProfiles && speakerProfiles.length > 0
        ? `

**SPEAKER PROFILES**:
${speakerProfiles
  .map(
    (p) => `
[${p.id}]
- Gender: ${p.characteristics.gender}
- Role: ${p.inferredIdentity || 'unknown'}
- Style: ${p.speakingStyle?.formality || 'normal'}
- Vocabulary: ${p.speakingStyle?.vocabulary || 'standard'}
`
  )
  .join('')}
**TRANSLATION STYLE EXAMPLES**:
- formal style → polite/literary expressions
- casual style → colloquial expressions
- technical vocabulary → preserve domain terms

Example:
Speaker (casual): "Amazing!" → casual ${targetLanguage} equivalent
Speaker (formal): "That is quite impressive." → formal ${targetLanguage} equivalent
`
        : ''
    }`;
  }

  return `You are an expert Subtitle Translation Quality Specialist.
    Your PRIMARY GOAL is to perfect the ${targetLanguage} translation quality for ${genre} content.
    
    TASK RULES (Strict Priority):
    
    [P0 - HIGHEST] User Directives
    → If a subtitle has a "comment" field, follow that instruction exactly
    → User corrections override all other rules
    
    [P1 - PRIMARY FOCUS] Translation Quality Improvement
    → Fix mistranslations and missed meanings
    → Improve awkward or unnatural ${targetLanguage} phrasing
    → Ensure ALL 'text_translated' fields are ${targetLanguage} (never English, Japanese, or other languages)
    → Apply glossary terms consistently
    → Verify translation captures the full intent of 'text_original'${getSearchEnhancedProofreadPrompt('batchProofread', targetLanguage)}

    [P2 - CONTENT ACCURACY] Audio Verification
    → Listen to audio carefully
    → If you hear CLEAR, MEANINGFUL speech NOT in the subtitles → ADD new subtitle entries
    → Do NOT add: background noise, music lyrics, ambient sounds, or unintelligible speech
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
    ✓ All 'text_translated' are fluent ${targetLanguage}
    ✓ No missed speech from audio
    ✓ Translation quality significantly improved
    ---
    CONTEXT INFORMATION:
    ${getGenreSpecificGuidance(genre)}${
      customPrompt
        ? `
    
    **USER-PROVIDED INSTRUCTIONS** (Follow these additional guidelines from the user):
    ${customPrompt}`
        : ''
    }${
      glossaryText
        ? `
    ${glossaryText}`
        : ''
    }`;
};

export const GLOSSARY_EXTRACTION_PROMPT = (genre: string, targetLanguage: string) => {
  targetLanguage = toLanguageName(targetLanguage);
  return `
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
  • If speaker says "Tokyo", extract "Tokyo" NOT "${targetLanguage === 'Simplified Chinese' ? '东京' : 'Translated Tokyo'}"
  • If speaker says "Microsoft", extract "Microsoft" NOT "${targetLanguage === 'Simplified Chinese' ? '微软' : 'Translated Microsoft'}"
→ **CRITICAL**: Listen to what is ACTUALLY SAID, not what you think the translation equivalent is

[P1 - EXTRACTION] Identify Key Terms in Audio Language
→ Listen carefully to the audio
→ Extract names (people, characters, organizations) AS SPOKEN
→ Extract places (locations, venues, regions) AS SPOKEN
→ Extract specialized terms (technical jargon, domain-specific vocabulary) AS SPOKEN
→ Extract recurring phrases that need consistent translation
→ ONLY include terms that ACTUALLY APPEAR in this audio segment

[P2 - TRANSLATION] Provide Accurate Translations
→ Translate all terms to ${targetLanguage}
→ For names: Use standard transliterations (e.g., "Alice" → "${targetLanguage === 'Simplified Chinese' ? '艾丽丝' : 'Alice'}")
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
✓ All translations are in ${targetLanguage}
✓ Translations verified with search when needed
✓ Only included terms that need consistent translation
✓ Notes added where helpful for consistency
`;
};

export const getSpeakerProfileExtractionPrompt = (
  genre: string,
  minSpeakers?: number,
  maxSpeakers?: number
) => {
  // Build speaker count hint if provided
  let speakerCountHint = '';
  if (minSpeakers && maxSpeakers) {
    speakerCountHint = `\n- **USER HINT - EXPECTED SPEAKER COUNT**: Between ${minSpeakers} and ${maxSpeakers} speakers`;
  } else if (minSpeakers) {
    speakerCountHint = `\n- **USER HINT - EXPECTED SPEAKER COUNT**: At least ${minSpeakers} speakers`;
  } else if (maxSpeakers) {
    speakerCountHint = `\n- **USER HINT - EXPECTED SPEAKER COUNT**: At most ${maxSpeakers} speakers`;
  }

  return `
**TASK**: Extract comprehensive speaker profiles from audio samples for downstream voice matching.

**CONTEXT**:
- Genre: ${genre}
- Audio: Representative samples from different time periods
- Purpose: Create voice fingerprint database for Gemini Flash to identify speakers
- **Tools Available**: Google Search (use to verify public figures if names are mentioned)${speakerCountHint}

**SPEAKER PROFILE EXTRACTION**:
1. Identify ALL distinct speakers (missing a speaker is critical failure)
2. For each speaker, document:
   - **Voice characteristics**: gender, name (if mentioned), pitch, speed, accent, tone
   - **Inferred identity/role**: occupation, character role, identity clues (if mentioned in dialogue)
   - **Speaking style**: 
     * Formality: formal/casual/mixed (level of formality)
     * Vocabulary: technical/colloquial/poetic/etc. (vocabulary style)
     * Sentence structure: complex/simple/fragmented (sentence patterns)
   - **Emotional tone**: enthusiastic/calm/nervous/authoritative/etc. (emotional baseline)
   - **Catchphrases**: verbal tics, repeated phrases, language habits (if clearly identifiable)
   - **Speaking context**: speaking scenarios or topics discussed (helps with matching)
   - **6-8 representative quotes**: original quotes extracted from different parts of the audio
   - **Confidence score**: 0.0-1.0

**OUTPUT FORMAT** (JSON):
\`\`\`json
{
  "speakerCount": <integer>,
  "profiles": [
    {
      "id": "Speaker 1",
      "characteristics": {
        "name": "<name if mentioned, in source language (e.g., '田中' not 'Tanaka')>",
        "gender": "male" | "female" | "unknown",
        "pitch": "low" | "medium" | "high",
        "speed": "slow" | "normal" | "fast",
        "accent": "<English description>",
        "tone": "<English description, e.g., calm, energetic>"
      },
      "inferredIdentity": "<role/name if identifiable>",
      "speakingStyle": {
        "formality": "formal" | "casual" | "mixed",
        "vocabulary": "<description, e.g., technical, colloquial>",
        "sentenceStructure": "<description, e.g., complex, simple>"
      },
      "emotionalTone": "<description, e.g., enthusiastic, calm>",
      "catchphrases": ["<phrase 1>", "<phrase 2>"],
      "speakingContext": ["<context 1>", "<context 2>"],
      "sampleQuotes": ["<quote 1>", "<quote 2>", ..., "<quote 6-8>"],
      "confidence": <0.0-1.0>
    }
  ]
}
\`\`\`

**QUALITY CONSTRAINTS**:
- Use confidence >0.8 ONLY for very distinct voices
- If uncertain between 2-3 speakers, list all (better over-identify than miss)
- Include background speakers if they speak ≥3 sentences
- Describe accents/tone in English for consistency

**CONFIDENCE SCORING GUIDE**:
- 0.9-1.0: Extremely distinct voice with unique characteristics, name mentioned in dialogue
- 0.7-0.89: Clearly distinguishable, consistent patterns observed across multiple segments
- 0.5-0.69: Moderately distinguishable, some overlap with other speakers possible
- 0.3-0.49: Low confidence, similar to other speakers or inconsistent patterns
- 0.0-0.29: Very uncertain, might be same speaker as another profile

**EXAMPLE OUTPUT**:
\`\`\`json
{
  "speakerCount": 2,
  "profiles": [
    {
      "id": "Speaker 1",
      "characteristics": {
        "name": "John",
        "gender": "male",
        "pitch": "low",
        "speed": "fast",
        "accent": "American English",
        "tone": "Professional, Authoritative"
      },
      "inferredIdentity": "News Anchor / Host",
      "speakingStyle": {
        "formality": "formal",
        "vocabulary": "professional broadcast terminology",
        "sentenceStructure": "complex, well-structured"
      },
      "emotionalTone": "calm, confident, authoritative",
      "catchphrases": ["Welcome to the show", "Let's dive into"],
      "speakingContext": ["introducing topics", "asking questions", "transitioning segments"],
      "sampleQuotes": ["Welcome to the show tonight.", "Let's bring in our guest.", "That's an excellent point.", "We'll be right back after this.", "Thank you for watching.", "Let's dive into today's headlines."],
      "confidence": 0.95
    },
    {
      "id": "Speaker 2",
      "characteristics": {
        "name": "田中美咲",
        "gender": "female",
        "pitch": "high",
        "speed": "normal",
        "accent": "Japanese (Kansai dialect)",
        "tone": "Energetic, Friendly"
      },
      "inferredIdentity": "Guest / Expert",
      "speakingStyle": {
        "formality": "casual",
        "vocabulary": "colloquial, regional expressions",
        "sentenceStructure": "simple, conversational"
      },
      "emotionalTone": "enthusiastic, warm, expressive",
      "catchphrases": ["ほんまに", "めっちゃ"],
      "speakingContext": ["discussing food culture", "sharing personal experiences", "responding to questions"],
      "sampleQuotes": ["こんにちは！田中です！", "大阪の食べ物は最高です！", "ほんまにそうですね！", "めっちゃ美味しいんですよ。", "私も同じこと思ってました。", "これはぜひ試してほしい！"],
      "confidence": 0.88
    }
  ]
}
\`\`\`
`;
};

/**
 * Generate translation batch prompt
 */
export const getTranslationBatchPrompt = (
  batchLength: number,
  payload: any[],
  targetLanguage: string
): string => {
  targetLanguage = toLanguageName(targetLanguage);
  return `
    TRANSLATION BATCH TASK
    
    TASK: Translate ${batchLength} subtitle segments to ${targetLanguage}.
    
    RULES (Priority Order):
    
    [P1 - ACCURACY] Complete and Accurate Translation
    → Translate all ${batchLength} items (one-to-one mapping with input IDs)
    → Ensure no meaning is lost from source text
    → ID matching is critical - do not skip any ID
    → Output exactly ${batchLength} items in the response
    → **MULTI-LINE CONTEXT**: Read the previous and next 1-2 lines to understand context. This helps with:
       - Resolving ambiguous pronouns (e.g., "it", "that")
       - Understanding incomplete sentences split across lines
       - Maintaining consistent tone
    → **STRICT BOUNDARY RULE**: Use this context for **UNDERSTANDING** only. **NEVER** merge segments or move text between lines.
    → **PARTIAL SENTENCES**: If a sentence is split across lines, translate ONLY the specific fragment in the current line. Do not "complete" it using text from the next line.
    
    [P2 - QUALITY] Translation Excellence
    → ${getFillerWordsRule()} and stuttering
    → Produce fluent, natural ${targetLanguage}
    → Use terminology from system instruction if provided
    → Maintain appropriate tone and style${getSearchEnhancedTranslationPrompt('translation', targetLanguage)}

    [P3 - OUTPUT] Format Requirements
    → 'text_translated' MUST BE in ${targetLanguage}
    → Never output English, Japanese, or other languages in 'text_translated'
    → Maintain exact ID values from input
    
    FINAL VERIFICATION:
    ✓ All ${batchLength} IDs present in output
    ✓ All translations are ${targetLanguage}
    ✓ No meaning lost from original text
    ✓ Filler words removed
    
    Input JSON:
    ${JSON.stringify(payload)}
    `;
};

/**
 * Parameters for proofread prompt
 */
export interface ProofreadPromptParams {
  totalVideoDuration?: number;
  payload: any[];
  glossaryContext: string;
  specificInstruction: string;
  targetLanguage: string;
}

/**
 * Generate proofread prompt
 */
export const getProofreadPrompt = (params: ProofreadPromptParams): string => {
  const targetLanguage = toLanguageName(params.targetLanguage);
  return `
    TRANSLATION QUALITY IMPROVEMENT TASK
    Total video duration: ${params.totalVideoDuration ? formatTime(params.totalVideoDuration) : 'Unknown'}
    ${params.glossaryContext}
    ${params.specificInstruction}

    TASK RULES (Priority Order):
    
    [P1 - PRIMARY] Translation Quality Excellence
    → Fix mistranslations and missed meanings
    → Improve awkward or unnatural ${targetLanguage} phrasing
    → Ensure ALL 'text_translated' are fluent ${targetLanguage} (never English/Japanese/etc.)
    → Verify translation captures full intent of 'text_original'${getSearchEnhancedProofreadPrompt('batchProofread', targetLanguage)}

    [P2 - CONTENT] Audio Content Verification
    → Listen to audio carefully
    → If you hear CLEAR, MEANINGFUL speech NOT in subtitles → ADD new subtitle entries
    → Do NOT add: background noise, music lyrics, ambient sounds, or unintelligible speech
    → Verify 'text_original' matches what was actually said
    → **MULTI-LINE CONTEXT**: Before refining each line, READ the previous and next 1-2 lines to understand the full context.
    → **SENTENCE CONTINUITY**: Check for sentences spanning multiple subtitles to ensure logical flow.
    
    [P3 - ABSOLUTE] Timestamp Preservation
    → DO NOT modify timestamps of existing subtitles
    → Exception: When adding NEW entries for missed speech, assign appropriate timestamps
    → Even if existing lines are very long → LEAVE their timing unchanged
    → Your job is TRANSLATION quality, not timing adjustment
    
    [P4 - PRESERVATION] Default Behavior
    → For subtitles WITHOUT issues: preserve them as-is
    → Only modify when there's a clear translation quality problem
    
    FINAL VERIFICATION:
    ✓ All 'text_translated' are fluent ${targetLanguage}
    ✓ No missed meaning from 'text_original'
    ✓ No missed speech from audio
    ✓ Translation quality significantly improved

    Current Subtitles JSON:
    ${JSON.stringify(params.payload)}
    // End of getProofreadPrompt string template
    `;
};

/**
 * Parameters for refinement prompt
 */
export interface RefinementPromptParams {
  genre: string;
  payload: RefinementPayload[];
  glossaryInfo: string;
  glossaryCount?: number;
  enableDiarization: boolean;
  targetLanguage?: string;
}

/**
 * Generate refinement prompt for transcription refinement
 */
export const getRefinementPrompt = (params: RefinementPromptParams): string => `
            TRANSCRIPTION REFINEMENT TASK
            Context: ${params.genre}

            TASK: Refine the raw OpenAI Whisper transcription by listening to the audio and correcting errors.

            RULES (Priority Order):

            [P0 - COMPLETENESS] Process ALL Segments
            → You MUST process EVERY segment in the input - NO EXCEPTIONS
            → Output count MUST be >= input count (splitting allowed, dropping NOT allowed)
            → NEVER skip or omit any speech content
            → If input has ${params.payload.length} segments, output must have at least ${params.payload.length} segments

            [P1 - ACCURACY] Audio-Based Correction
            → Listen carefully to the attached audio
            → Fix misrecognized words and phrases in 'text'
            → Verify timing accuracy of 'start' and 'end' timestamps
            ${params.glossaryInfo ? `→ Pay special attention to key terminology listed below` : ''}
${getSearchEnhancedRefinementPrompt('refinement')}
            [P2 - READABILITY] Segment Splitting
            → ${getSegmentSplittingRule()}
            ${getTimestampSplittingInstructions()}
            
            [P3 - CLEANING] Remove Non-Speech Elements
            → ${getFillerWordsRule()}
            → Remove stuttering and false starts
            → Keep natural speech flow

            [P4 - OUTPUT] Format Requirements
            → Return timestamps in HH:MM:SS,mmm format
            → Timestamps must be relative to the provided audio (starting at 00:00:00,000)
            → Ensure all required fields are present
            ${params.enableDiarization ? `→ INCLUDE "speaker" field for every segment (e.g., "Speaker 1")` : ''}

            FINAL VERIFICATION:
            ✓ ALL ${params.payload.length} input segments are processed (no content dropped)
            ✓ Output segment count >= ${params.payload.length}
            ✓ Long segments (>${MAX_SEGMENT_DURATION_SECONDS}s or >${SUBTITLE_MAX_WIDTH} visual width) properly split
            ✓ Timestamps are relative to chunk start
            ✓ Terminology from glossary is used correctly
            ${params.glossaryInfo ? `✓ Checked against ${params.glossaryCount} glossary terms` : ''}

            Input Transcription (JSON):
            ${JSON.stringify(params.payload)}
            `;
