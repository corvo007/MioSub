import { GlossaryItem } from '@/types/glossary';
import { SpeakerProfile } from './speakerProfile';
import { formatTime } from '@/services/subtitle/time';

// --- Constants ---

/** Maximum segment duration before splitting (seconds) */
const MAX_SEGMENT_DURATION_SECONDS = 4;

/** Maximum character count before splitting */
const MAX_SEGMENT_CHARACTERS = 25;

/** Filler words to remove across all languages */
const FILLER_WORDS = [
  // English
  'uh',
  'um',
  'ah',
  'er',
  'hmm',
  // Japanese
  'eto',
  'ano',
  'えーと',
  'あの',
  // Chinese
  '呃',
  '嗯',
  '那个',
  '就是',
];

/** Filler words formatted for prompt inclusion */
const FILLER_WORDS_PROMPT = FILLER_WORDS.join(', ');

/** Temporal proximity thresholds for translation distribution (seconds) */
const TEMPORAL_THRESHOLDS = {
  /** Lines closer than this can share content */
  CLOSE_SECONDS: 3,
  /** Lines farther than this must be isolated */
  FAR_SECONDS: 5,
};

/** Model name for display in prompts */
const SENIOR_MODEL_NAME = 'Gemini 2.5 Pro';

// --- Helper Functions ---

/**
 * Get standard segment splitting rule text for prompts
 */
function getSegmentSplittingRule(
  context: 'transcription' | 'translation' = 'transcription'
): string {
  const charType = context === 'translation' ? 'Chinese characters' : 'characters';
  return `SPLIT any segment longer than ${MAX_SEGMENT_DURATION_SECONDS} seconds OR >${MAX_SEGMENT_CHARACTERS} ${charType}`;
}

/**
 * Get filler words removal rule text
 */
function getFillerWordsRule(): string {
  return `Remove filler words (${FILLER_WORDS_PROMPT})`;
}

/**
 * Get temporal proximity rule text for translation distribution
 */
function getTemporalProximityRule(): string {
  return `→ **TEMPORAL PROXIMITY RULE**: 
       - If adjacent lines are **< ${TEMPORAL_THRESHOLDS.CLOSE_SECONDS} seconds apart**: You may freely distribute the translation content across these lines to achieve **visually balanced line lengths**.
       - If adjacent lines are **${TEMPORAL_THRESHOLDS.CLOSE_SECONDS}-${TEMPORAL_THRESHOLDS.FAR_SECONDS} seconds apart**: Use your judgment. Prefer distribution if they form a single sentence, otherwise keep content isolated.
       - If adjacent lines are **> ${TEMPORAL_THRESHOLDS.FAR_SECONDS} seconds apart**: Keep the translation content **strictly within each line's own segment**.`;
}

/**
 * Format glossary for prompt inclusion
 */
function formatGlossaryForPrompt(
  glossary: GlossaryItem[] | undefined,
  mode: 'refinement' | 'translation' | 'proofread' | 'fix_timestamps'
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
  mode: 'refinement' | 'translation' | 'proofread' | 'fix_timestamps',
  glossary?: GlossaryItem[],
  enableDiarization?: boolean,
  speakerProfiles?: SpeakerProfile[]
): string => {
  // For non-supported modes or disabled diarization, delegate to original function
  if ((mode !== 'fix_timestamps' && mode !== 'refinement') || !enableDiarization) {
    return getSystemInstruction(genre, customPrompt, mode, glossary);
  }

  // For fix_timestamps with diarization, build custom prompt
  const glossaryText = formatGlossaryForPrompt(glossary, mode);

  let diarizationSection = '';
  if (enableDiarization) {
    if (speakerProfiles && speakerProfiles.length > 0) {
      // **SCENARIO A: WITH PRE-ANALYZED PROFILES**
      diarizationSection = `
[P1.5 - SPEAKER IDENTIFICATION] Diarization (ENABLED - WITH PROFILE DATABASE)

**IMPORTANT**: A senior AI (${SENIOR_MODEL_NAME}) has pre-analyzed this audio and identified ${speakerProfiles.length} speakers.
Your task is to MATCH voices to these profiles.

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
- This should be RARE - Gemini 3.0 Pro is very thorough

**QUALITY VERIFICATION**:
✓ Every subtitle has a "speaker" field
✓ Speaker IDs match profile list (or are justified new additions)
✓ Voice changes are detected and speaker switches occur appropriately
✓ Consistency maintained across the batch
`;
    } else {
      // **SCENARIO B: NO PROFILES (REAL-TIME DETECTION)**
      diarizationSection = `
[P1.5 - SPEAKER IDENTIFICATION] Audio Diarization
→ **CRITICAL TASK**: Identify and label DISTINCT SPEAKERS in the audio
→ **OUTPUT FORMAT**: Add "speaker" field to EVERY subtitle entry
→ **LABELING**: Use "Speaker 1", "Speaker 2", "Speaker 3", etc.

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

  if (mode === 'refinement') {
    return `You are a professional Subtitle QA Specialist. 
    You will receive an audio chunk and a raw JSON transcription.
    
    YOUR TASKS:
    1. Listen to the audio to verify the transcription.
    2. **CHECK FOR MISSED HEARING**: If there is speech in the audio that is MISSING from the transcription, you MUST ADD IT.
    3. FIX TIMESTAMPS: Ensure start/end times match the audio speech perfectly. **Timestamps MUST be strictly within the provided audio duration.**
    4. FIX TRANSCRIPTION: Correct mishearings, typos, and proper nouns (names, terminology).
    5. IGNORE FILLERS: Do not transcribe stuttering or meaningless filler words (${FILLER_WORDS_PROMPT}).
    6. SPLIT LINES: STRICT RULE. ${getSegmentSplittingRule()}, YOU MUST SPLIT IT into shorter, natural segments.
    7. **LANGUAGE RULE**: Keep the transcription in the ORIGINAL LANGUAGE spoken in the audio. DO NOT translate to any other language.
    8. FORMAT: Return a valid JSON array.

    ${diarizationSection}

    9. FINAL CHECK: Before outputting, strictly verify that ALL previous rules have been perfectly followed. Correct any remaining errors.
    
    Genre Context: ${genre}${glossaryText}`;
  }

  return `You are a professional Subtitle Timing and Synchronization Specialist.
Your PRIMARY GOAL is to perfect timestamp alignment and segment timing for ${genre} content.

TASK RULES (Priority Order):

[P0 - HIGHEST] User Directives
→ If a subtitle has a "comment" field, follow that instruction exactly
→ User corrections override all other rules

[P1 - PRIMARY FOCUS] Timestamp Alignment
→ Listen to audio and align start/end times to actual speech boundaries
→ Ensure timestamps are strictly within the provided audio duration
→ Timestamps must be relative to provided audio file (starting at 00:00:00)
→ Fix timing drift and bunched-up segments

${diarizationSection}

[P2 - READABILITY] Segment Splitting
→ ${getSegmentSplittingRule('translation')}
→ When splitting: distribute timing proportionally based on audio
→ Ensure natural speech breaks between split segments

[P3 - CONTENT ACCURACY] Audio Content Verification
→ If you hear speech NOT in subtitles → ADD new subtitle entries
→ ${getFillerWordsRule()} from 'text_original'

[P4 - ABSOLUTE RULE] Translation Preservation
→ DO NOT modify 'text_translated' field under ANY circumstances
→ Even if translation is incorrect → LEAVE IT UNCHANGED
→ Your job is TIMING and SPEAKER IDENTIFICATION, not translation
→ Translation fixes belong in the Proofread function

OUTPUT REQUIREMENTS:
✓ Valid JSON matching input structure
✓ Preserve all IDs (assign new IDs only for inserted/split segments)
✓ All timestamps in HH:MM:SS,mmm format
✓ Ensure start < end for all segments
${enableDiarization ? '✓ Every subtitle has a "speaker" field' : ''}

FINAL QUALITY CHECK:
Before returning, verify:
✓ All timestamps aligned to audio speech
✓ Long segments properly split
✓ No missed speech from audio
✓ 'text_translated' completely unchanged from input
${enableDiarization ? '✓ Speaker assignments are consistent and accurate' : ''}

Context: ${genre}${glossaryText}`;
};

export const getSystemInstruction = (
  genre: string,
  customPrompt: string | undefined,
  mode: 'refinement' | 'translation' | 'proofread' | 'fix_timestamps' = 'translation',
  glossary?: GlossaryItem[],
  speakerProfiles?: SpeakerProfile[]
): string => {
  // Use helper function to format glossary
  const glossaryText = formatGlossaryForPrompt(glossary, mode);

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
    5. IGNORE FILLERS: Do not transcribe stuttering or meaningless filler words (${FILLER_WORDS_PROMPT}).
    6. SPLIT LINES: STRICT RULE. ${getSegmentSplittingRule()}, YOU MUST SPLIT IT into shorter, natural segments.
    7. **LANGUAGE RULE**: Keep the transcription in the ORIGINAL LANGUAGE spoken in the audio. DO NOT translate to any other language.
    8. FORMAT: Return a valid JSON array.
    9. FINAL CHECK: Before outputting, strictly verify that ALL previous rules (1-8) have been perfectly followed. Correct any remaining errors.
    
    
    Genre Context: ${genre}${glossaryText}`;
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
    Your GOAL is to provide fluent, natural Simplified Chinese (zh-CN) translations while strictly preserving the subtitle structure.

    TASK RULES (Strict Priority):

    [P0 - STRUCTURAL INTEGRITY]
    → **ONE INPUT = ONE OUTPUT**: You must return exactly one translated subtitle for every input subtitle.
    → **ID PRESERVATION**: Maintain the "id" field exactly as provided.
    → **NO MERGING/SPLITTING**: Do not combine multiple lines or split a single line.
    → **TIMESTAMPS**: Do not modify timestamps.

    [P1 - TRANSLATION QUALITY]
    → **FLUENCY**: Translate into natural, written Chinese, not "translationese".
    → **CONTEXT AWARENESS**: Use the provided genre context to determine tone and style.
    → **COMPLETENESS**: Ensure every meaningful part of the original text is represented.
    → **NO HALLUCINATIONS**: Do not invent information not present in the source.

    [P1.5 - CONTEXT-AWARE DISTRIBUTION]
    → **MULTI-LINE CONTEXT**: Before translating each line, READ the previous and next 1-2 lines to understand the full context. This helps with:
       - Resolving ambiguous words or pronouns (e.g., "it", "that", "this")
       - Understanding incomplete sentences that span multiple lines
       - Maintaining consistent tone and terminology across related lines
    → **SENTENCE CONTINUITY**: When consecutive subtitles are part of the SAME SENTENCE (check for incomplete phrases, missing punctuation), consider them together for translation.
    → **TEMPORAL PROXIMITY RULE**: 
       - If adjacent lines are **< 3 seconds apart**: You may freely distribute the translation content across these lines to achieve **visually balanced line lengths** (avoid one very long line followed by a very short line).
       - If adjacent lines are **> 5 seconds apart**: Keep the translation content **strictly within each line's own segment**. Do NOT move content between them even if they're part of the same sentence. This prevents reader confusion due to temporal discontinuity.
    → **VISUAL BALANCE**: When distributing, aim for similar character counts per line for better subtitle aesthetics.
    → **NATURAL BREAKS**: Split the translation at natural phrase boundaries (e.g., after clauses, before conjunctions).

    [P2 - CLEANUP & REFINEMENT]
    → **REMOVE FILLERS**: Ignore stuttering, hesitation, and meaningless fillers (e.g., "uh", "um", "ah", "eto", "ano", "呃", "那个").
    → **CONCISENESS**: Keep subtitles concise and easy to read quickly.

    [P3 - TERMINOLOGY]
    → **GLOSSARY**: Strictly follow the provided glossary for specific terms.
    → **CONSISTENCY**: Maintain consistent terminology for names and places.

    OUTPUT REQUIREMENTS:
    ✓ Valid JSON matching input structure
    ✓ Output count MUST match input count exactly
    ✓ All 'text_translated' fields must be Simplified Chinese

    FINAL QUALITY CHECK:
    Before returning, verify:
    ✓ Did I return the exact same number of items as the input?
    ✓ Are all IDs preserved?
    ✓ Is the Chinese fluent and natural?
    ✓ Did I remove all filler words?
    ✓ Are translations visually balanced across temporally-close lines?

    ${genreContext}${glossaryText}${
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
Speaker (casual): "すごい！" → "太棒了！"
Speaker (formal): "すごいですね" → "真是令人印象深刻。"
`
        : ''
    }`;
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
      → ${getSegmentSplittingRule('translation')}
      → When splitting: distribute timing proportionally based on audio
      → Ensure natural speech breaks between split segments
      
      [P3 - CONTENT ACCURACY] Audio Content Verification
      → If you hear speech NOT in subtitles → ADD new subtitle entries
      → ${getFillerWordsRule()} from 'text_original'
      
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

  return `You are an expert Subtitle Translation Quality Specialist.
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

export const getSpeakerProfileExtractionPrompt = (genre: string) => `
**TASK**: Extract comprehensive speaker profiles from audio samples for downstream voice matching.

**CONTEXT**:
- Genre: ${genre}
- Audio: Representative samples from different time periods
- Purpose: Create voice fingerprint database for Gemini 2.5 Flash to identify speakers
- **Tools Available**: Google Search (use to verify public figures if names are mentioned)

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

/**
 * Generate translation batch prompt
 */
export const getTranslationBatchPrompt = (batchLength: number, payload: any[]): string => `
    TRANSLATION BATCH TASK
    
    TASK: Translate ${batchLength} subtitle segments to Simplified Chinese.
    
    RULES (Priority Order):
    
    [P1 - ACCURACY] Complete and Accurate Translation
    → Translate all ${batchLength} items (one-to-one mapping with input IDs)
    → Ensure no meaning is lost from source text
    → ID matching is critical - do not skip any ID
    → Output exactly ${batchLength} items in the response
    
    [P1.5 - CONTEXT-AWARE DISTRIBUTION]
    → **MULTI-LINE CONTEXT**: Before translating each line, READ the previous and next 1-2 lines to understand the full context. This helps resolve ambiguous words, pronouns, and incomplete sentences.
    → **SENTENCE CONTINUITY**: Look at "start" and "end" timestamps. If consecutive items are part of the SAME SENTENCE and are **< ${TEMPORAL_THRESHOLDS.CLOSE_SECONDS} seconds apart**, you may distribute translation content across them for **visual balance** (similar character counts per line).
    → **TEMPORAL ISOLATION**: If items are **> ${TEMPORAL_THRESHOLDS.FAR_SECONDS} seconds apart**, keep translation content **strictly within each item**. Do NOT shift content between them.
    → **NATURAL BREAKS**: When distributing, split at natural phrase boundaries (after clauses, before conjunctions).
    
    [P2 - QUALITY] Translation Excellence
    → ${getFillerWordsRule()} and stuttering
    → Produce fluent, natural Simplified Chinese
    → Use terminology from system instruction if provided
    → Maintain appropriate tone and style
    
    [P3 - OUTPUT] Format Requirements
    → 'text_translated' MUST BE in Simplified Chinese
    → Never output English, Japanese, or other languages in 'text_translated'
    → Maintain exact ID values from input
    
    FINAL VERIFICATION:
    ✓ All ${batchLength} IDs present in output
    ✓ All translations are Simplified Chinese
    ✓ No meaning lost from original text
    ✓ Filler words removed
    ✓ Translations visually balanced across temporally-close lines
    
    Input JSON:
    ${JSON.stringify(payload)}
    `;

/**
 * Parameters for fix timestamps prompt
 */
export interface FixTimestampsPromptParams {
  batchLabel: string;
  lastEndTime: string;
  payload: any[];
  glossaryContext: string;
  specificInstruction: string;
  conservativeMode?: boolean; // Only fine-tune, no splits/merges
}

/**
 * Generate fix timestamps prompt
 */
export const getFixTimestampsPrompt = (params: FixTimestampsPromptParams): string => {
  const conservativeRules = params.conservativeMode
    ? `
    **[CONSERVATIVE MODE - MINIMAL CHANGES]**
    → DO NOT split or merge any segments
    → DO NOT add new subtitle entries (even for missed speech - note in "comment" field instead)
    → ONLY fine-tune timestamps that are clearly misaligned (>0.5 second off)
    → Preserve original segment count and structure exactly
    → Output must have EXACTLY the same number of items as input
    `
    : `
    [P2 - MANDATORY] Segment Splitting for Readability
    → ${getSegmentSplittingRule('translation')}
    → When splitting: distribute timing based on actual audio speech
    → Ensure splits occur at natural speech breaks
    → For NEW/SPLIT entries: provide appropriate translation in Simplified Chinese
    `;

  const contentRules = params.conservativeMode
    ? `
    [P3 - CONTENT] Audio Verification (Limited)
    → If you hear speech NOT in the text → Note in "comment" field (do NOT add entries)
    → ${getFillerWordsRule()} from 'text_original'
    `
    : `
    [P3 - CONTENT] Audio Verification
    → If you hear speech NOT in the text → ADD new subtitle entries with translation
    → ${getFillerWordsRule()} from 'text_original'
    `;

  return `
    Batch ${params.batchLabel}.
    TIMESTAMP ALIGNMENT TASK${params.conservativeMode ? ' (CONSERVATIVE MODE)' : ''}
    Previous batch ended at: "${params.lastEndTime}"
    ${params.glossaryContext}
    ${params.specificInstruction}

    TASK RULES (Priority Order):
    
    [P1 - PRIMARY] Perfect Timestamp Alignment
    → Listen to audio carefully
    → Align "start" and "end" to actual speech boundaries in audio
    → Timestamps MUST be relative to provided audio file (starting at 00:00:00)
    → Fix bunched-up or spread-out timing issues
    ${conservativeRules}
    ${contentRules}
    [P4 - ABSOLUTE] Translation Preservation
    → DO NOT modify 'text_translated' of EXISTING entries under ANY circumstances
    → Even if it's English, wrong, or nonsensical → LEAVE IT
    → Translation is handled by Proofread function, not here
    
    FINAL VERIFICATION:
    ✓ All timestamps aligned to audio
    ${params.conservativeMode ? '✓ Segment count unchanged from input' : '✓ Long segments split appropriately'}
    ✓ No missed speech
    ✓ 'text_translated' of existing entries completely unchanged

    Input JSON (${params.payload.length} items):
    ${JSON.stringify(params.payload)}
        `;
};

/**
 * Parameters for proofread prompt
 */
export interface ProofreadPromptParams {
  batchLabel: string;
  lastEndTime: string;
  totalVideoDuration?: number;
  payload: any[];
  glossaryContext: string;
  specificInstruction: string;
}

/**
 * Generate proofread prompt
 */
export const getProofreadPrompt = (params: ProofreadPromptParams): string => `
    Batch ${params.batchLabel}.
    TRANSLATION QUALITY IMPROVEMENT TASK
    Previous batch ended at: "${params.lastEndTime}"
    Total video duration: ${params.totalVideoDuration ? formatTime(params.totalVideoDuration) : 'Unknown'}
    ${params.glossaryContext}
    ${params.specificInstruction}

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

    [P2.5 - CONTEXT-AWARE DISTRIBUTION]
    → **MULTI-LINE CONTEXT**: Before refining each line, READ the previous and next 1-2 lines to understand the full context.
    → **SENTENCE CONTINUITY**: Check for sentences spanning multiple subtitles.
    ${getTemporalProximityRule()}
    → **NATURAL BREAKS**: Split at natural phrase boundaries.
    
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
    ${JSON.stringify(params.payload)}
        `;

/**
 * Parameters for refinement prompt
 */
export interface RefinementPromptParams {
  genre: string;
  rawSegments: any[];
  glossaryInfo: string;
  glossaryCount?: number;
  enableDiarization: boolean;
}

/**
 * Generate refinement prompt for transcription refinement
 */
export const getRefinementPrompt = (params: RefinementPromptParams): string => `
            TRANSCRIPTION REFINEMENT TASK
            Context: ${params.genre}

            TASK: Refine the raw OpenAI Whisper transcription by listening to the audio and correcting errors.

            RULES (Priority Order):

            [P1 - ACCURACY] Audio-Based Correction
            → Listen carefully to the attached audio
            → Fix misrecognized words and phrases in 'text'
            → Verify timing accuracy of 'start' and 'end' timestamps
            ${params.glossaryInfo ? `→ Pay special attention to key terminology listed below` : ''}

            [P2 - READABILITY] Segment Splitting
            → ${getSegmentSplittingRule()}
            → When splitting: distribute timing based on actual audio speech
            → Ensure splits occur at natural speech breaks
            
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
            ✓ Long segments (>${MAX_SEGMENT_DURATION_SECONDS}s or >${MAX_SEGMENT_CHARACTERS} chars) properly split
            ✓ Timestamps are relative to chunk start
            ✓ Terminology from glossary is used correctly
            ${params.glossaryInfo ? `✓ Checked against ${params.glossaryCount} glossary terms` : ''}

            Input Transcription (JSON):
            ${JSON.stringify(params.rawSegments.map((s) => ({ start: s.startTime, end: s.endTime, text: s.original })))}
            `;
