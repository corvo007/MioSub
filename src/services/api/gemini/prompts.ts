import { BatchOperationMode } from "@/types/subtitle";
import { GlossaryItem } from "@/types/glossary";
import { SpeakerProfile } from "./speakerProfile";
import { formatTime } from "@/services/subtitle/time";

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
  // Get glossary text
  // Get glossary text
  let glossaryText = '';
  if (glossary && glossary.length > 0) {
    if (mode === 'refinement') {
      glossaryText = `\n\nKEY TERMINOLOGY (Listen for these terms and transcribe them accurately in the ORIGINAL LANGUAGE):\n${glossary.map(g => `- ${g.term}${g.notes ? ` (${g.notes})` : ''}`).join('\n')}`;
    } else {
      glossaryText = `\n\nTERMINOLOGY GLOSSARY (STRICTLY FOLLOW):\n${glossary.map(g => `- ${g.term}: ${g.translation} ${g.notes ? `(${g.notes})` : ''}`).join('\n')}`;
    }
  }

  let diarizationSection = '';
  if (enableDiarization) {
    if (speakerProfiles && speakerProfiles.length > 0) {
      // **SCENARIO A: WITH PRE-ANALYZED PROFILES**
      diarizationSection = `
[P1.5 - SPEAKER IDENTIFICATION] Diarization (ENABLED - WITH PROFILE DATABASE)

**IMPORTANT**: A senior AI (Gemini 3.0 Pro) has pre-analyzed this audio and identified ${speakerProfiles.length} speakers.
Your task is to MATCH voices to these profiles.

**KNOWN SPEAKER PROFILES**:
${speakerProfiles.map((p, i) => `
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
   ${p.catchphrases && p.catchphrases.length > 0 ? `- Catchphrases: ${p.catchphrases.map(c => `"${c}"`).join(', ')}` : ''}
   ${p.speakingContext && p.speakingContext.length > 0 ? `- Speaking Context: ${p.speakingContext.join(', ')}` : ''}
   - Sample Quotes: ${p.sampleQuotes.map(q => `"${q}"`).join(', ')}
   - Confidence: ${(p.confidence * 100).toFixed(0)}%
`).join('\n')}

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
    5. IGNORE FILLERS: Do not transcribe stuttering or meaningless filler words (uh, um, ah, eto, ano, 呃, 那个).
    6. SPLIT LINES: STRICT RULE. If a segment is longer than 4 seconds or > 22 characters, YOU MUST SPLIT IT into shorter, natural segments.
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
→ SPLIT any segment longer than 4 seconds OR >25 Chinese characters
→ When splitting: distribute timing proportionally based on audio
→ Ensure natural speech breaks between split segments

[P3 - CONTENT ACCURACY] Audio Content Verification
→ If you hear speech NOT in subtitles → ADD new subtitle entries
→ Remove filler words from 'text_original' (uh, um, ah, etc.)

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
  glossary?: GlossaryItem[]
): string => {

  // Helper to format glossary for different modes
  let glossaryText = '';
  if (glossary && glossary.length > 0) {
    if (mode === 'refinement') {
      // For refinement: Only show original terms (no translations) to prevent language mixing
      glossaryText = `\n\nKEY TERMINOLOGY (Listen for these terms and transcribe them accurately in the ORIGINAL LANGUAGE):\n${glossary.map(g => `- ${g.term}${g.notes ? ` (${g.notes})` : ''}`).join('\n')}`;
    } else {
      // For translation/proofread: Show full glossary with translations
      glossaryText = `\n\nTERMINOLOGY GLOSSARY (STRICTLY FOLLOW):\n${glossary.map(g => `- ${g.term}: ${g.translation} ${g.notes ? `(${g.notes})` : ''}`).join('\n')}`;
    }
  }

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
    return `# ROLE
You are a professional Subtitle QA Specialist.
You will receive an audio chunk and a raw JSON transcription.

# RULES (Priority Order)
[P1 - ACCURACY] Verify and Fix Transcription
→ Listen to the audio to verify the transcription
→ Correct mishearings, typos, and proper nouns (names, terminology)

[P2 - COMPLETENESS] Check for Missed Speech
→ If there is speech in the audio that is MISSING from the transcription, you MUST ADD IT

[P3 - TIMESTAMPS] Fix Timing
→ Ensure start/end times match the audio speech perfectly
→ Timestamps MUST be strictly within the provided audio duration

[P4 - CLEANUP] Remove Non-Speech Elements
→ Do not transcribe stuttering or meaningless filler words (uh, um, ah, eto, ano, 呃, 那个)
→ Delete any sound effect descriptions like (laughter), (music), (applause), (笑), (音楽), etc.

[P5 - SPLITTING] Segment Length
→ STRICT RULE: If a segment is longer than 4 seconds or > 22 characters, YOU MUST SPLIT IT

[P6 - LANGUAGE] Original Language Only
→ Keep the transcription in the ORIGINAL LANGUAGE spoken in the audio
→ DO NOT translate to any other language

# OUTPUT
→ Return a valid JSON array

# FINAL VERIFICATION
✓ All speech in audio is transcribed
✓ Timestamps match audio exactly
✓ Long segments split appropriately
✓ No filler words or sound effects

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

    return `# ROLE
You are an expert Subtitle Translator specializing in ${genre} content.
Your GOAL is to provide fluent, natural Simplified Chinese (zh-CN) translations.

# RULES (Priority Order)
[P0 - STRUCTURAL INTEGRITY]
→ ONE INPUT = ONE OUTPUT: Return exactly one translated subtitle for every input
→ ID PRESERVATION: Maintain the "id" field exactly as provided
→ NO MERGING/SPLITTING: Do not combine multiple lines or split a single line
→ TIMESTAMPS: Do not modify timestamps

[P1 - TRANSLATION QUALITY]
→ FLUENCY: Translate into natural, written Chinese, not "translationese"
→ CONTEXT AWARENESS: Use the provided genre context to determine tone and style
→ COMPLETENESS: Ensure every meaningful part of the original text is represented
→ NO HALLUCINATIONS: Do not invent information not present in the source

[P2 - CLEANUP]
→ REMOVE FILLERS: Ignore stuttering, hesitation, and meaningless fillers (uh, um, 呃, 那个)
→ CONCISENESS: Keep subtitles concise and easy to read quickly

[P3 - TERMINOLOGY]
→ GLOSSARY: Strictly follow the provided glossary for specific terms
→ CONSISTENCY: Maintain consistent terminology for names and places

# OUTPUT
✓ Valid JSON matching input structure
✓ Output count MUST match input count exactly
✓ All 'text_translated' fields must be Simplified Chinese

# FINAL VERIFICATION
✓ Same number of items as input
✓ All IDs preserved
✓ Chinese is fluent and natural
✓ Filler words removed

${genreContext}${glossaryText}`;
  }

  // 3. Fix Timestamps Prompt (Flash 2.5)
  if (mode === 'fix_timestamps') {
    return `# ROLE
You are a Subtitle Timing and Synchronization Specialist for ${genre} content.

# RULES (Priority Order)
[P0 - HIGHEST] User Directives
→ If a subtitle has a "comment" field, follow that instruction exactly
→ User corrections override all other rules

[P1 - PRIMARY] Timestamp Alignment
→ Listen to audio and align start/end times to actual speech boundaries
→ Ensure timestamps are strictly within the provided audio duration
→ Timestamps must be relative to provided audio file (starting at 00:00:00)
→ Fix timing drift and bunched-up segments

[P2 - READABILITY] Segment Splitting
→ SPLIT any segment longer than 4 seconds OR >25 Chinese characters
→ When splitting: distribute timing proportionally based on audio
→ Ensure natural speech breaks between split segments

[P3 - CONTENT] Audio Content Verification
→ If you hear speech NOT in subtitles → ADD new subtitle entries
→ Remove filler words from 'text_original' (uh, um, 呃, 嗯, etc.)

[P4 - ABSOLUTE] Translation Preservation
→ DO NOT modify 'text_translated' field under ANY circumstances
→ Even if wrong or in English → LEAVE IT
→ Translation fixes belong in Proofread function

# OUTPUT
✓ Valid JSON matching input structure
✓ Preserve all IDs (new IDs only for inserted/split segments)
✓ All timestamps in HH:MM:SS,mmm format
✓ Ensure start < end for all segments

# FINAL VERIFICATION
✓ All timestamps aligned to audio speech
✓ Long segments properly split
✓ No missed speech from audio
✓ 'text_translated' completely unchanged`;
  }

  return `# ROLE
You are an expert Subtitle Translation Quality Specialist for ${genre} content.

# RULES (Priority Order)
[P0 - HIGHEST] User Directives
→ If a subtitle has a "comment" field, follow that instruction exactly
→ User corrections override all other rules

[P1 - PRIMARY] Translation Quality Improvement
→ Fix mistranslations and missed meanings
→ Improve awkward or unnatural Chinese phrasing
→ Ensure ALL 'text_translated' are Simplified Chinese (never English/Japanese/etc.)
→ Apply glossary terms consistently
→ Verify translation captures full intent of 'text_original'

[P2 - CONTENT] Audio Verification
→ Listen to audio carefully
→ If you hear speech NOT in subtitles → ADD new subtitle entries
→ Verify 'text_original' matches what was actually said

[P3 - ABSOLUTE] Timestamp Preservation
→ DO NOT modify timestamps of existing subtitles
→ Exception: When adding NEW entries for missed speech, assign appropriate timestamps
→ Your job is TRANSLATION quality, not timing adjustment

[P4 - LOWEST] Preservation Principle
→ For subtitles WITHOUT user comments: preserve unless clear translation error

# OUTPUT
✓ Valid JSON matching input structure
✓ Preserve IDs (new sequential IDs only when inserting)
✓ All timestamps in HH:MM:SS,mmm format

# FINAL VERIFICATION
✓ All user comments addressed
✓ All 'text_translated' are fluent Simplified Chinese
✓ No missed speech from audio
✓ Translation quality significantly improved
${getGenreSpecificGuidance(genre)}${glossaryText}`;
};

export const GLOSSARY_EXTRACTION_PROMPT = (genre: string) => `
# TASK
Extract key terminology from the audio that requires consistent translation.
Genre: ${genre}

# RULES (Priority Order)
[P0 - CRITICAL] Language Detection and Matching
→ FIRST: Detect the PRIMARY LANGUAGE spoken in this audio segment
→ SECOND: Extract ONLY terms that are spoken in that detected language
→ ABSOLUTE RULE: DO NOT extract terms in other languages
→ Examples for Japanese audio:
  • If speaker says "釜山" (Busan), extract "釜山" NOT "Busan"
  • If speaker says "スカイスキャナー", extract "スカイスキャナー" NOT "Skyscanner"
→ CRITICAL: Listen to what is ACTUALLY SAID, not what you think the translation equivalent is

[P1 - EXTRACTION] Identify Key Terms
→ Listen carefully to the audio
→ Extract names (people, characters, organizations) AS SPOKEN
→ Extract places (locations, venues, regions) AS SPOKEN
→ Extract specialized terms (technical jargon, domain-specific) AS SPOKEN
→ ONLY include terms that ACTUALLY APPEAR in this audio segment

[P2 - TRANSLATION] Provide Accurate Translations
→ Translate all terms to Simplified Chinese
→ For names: Use standard transliterations
→ For technical terms: Use established industry translations
→ Use Google Search to verify standard translations when uncertain

[P3 - ANNOTATION] Add Context
→ Add notes for ambiguous terms or pronunciation guidance
→ Include context that helps maintain translation consistency

[P4 - QUALITY] Focus on Consistency-Critical Terms
→ Prioritize terms that will appear multiple times
→ Skip common words that don't need special handling

# OUTPUT
→ JSON array: [{term: string, translation: string, notes?: string}]
→ "term" field MUST be in the ORIGINAL LANGUAGE spoken in audio
→ Return empty array [] if no significant terms found

# FINAL VERIFICATION
✓ Audio language detected correctly
✓ All "term" values match audio language
✓ All extracted terms actually appear in audio AS SPOKEN
✓ All translations are Simplified Chinese
`;


export const getSpeakerProfileExtractionPrompt = (genre: string) => `
# TASK
Extract comprehensive speaker profiles from audio samples for downstream voice matching.

# CONTEXT
- Genre: ${genre}
- Audio: Representative samples from different time periods
- Purpose: Create voice fingerprint database for Gemini 2.5 Flash to identify speakers
- Tools Available: Google Search (use to verify public figures if names are mentioned)

# EXTRACTION RULES
For each distinct speaker, document:
- Voice characteristics: gender, name (if mentioned), pitch, speed, accent, tone
- Inferred identity/role: 职业、角色、身份线索
- Speaking style: formality, vocabulary, sentence structure
- Emotional tone: enthusiastic/calm/nervous/authoritative/etc.
- Catchphrases: 口头禅、重复短语、语言习惯
- Speaking context: 说话场景或讨论的主题
- 6-8 representative quotes: 从音频不同部分提取的原文引用
- Confidence score: 0.0-1.0

# OUTPUT FORMAT
\`\`\`json
{
  "speakerCount": <integer>,
  "profiles": [
    {
      "id": "Speaker 1",
      "characteristics": {
        "name": "<name if mentioned, in source language>",
        "gender": "male" | "female" | "unknown",
        "pitch": "low" | "medium" | "high",
        "speed": "slow" | "normal" | "fast",
        "accent": "<English description>",
        "tone": "<English description>"
      },
      "inferredIdentity": "<role/name if identifiable>",
      "speakingStyle": {
        "formality": "formal" | "casual" | "mixed",
        "vocabulary": "<description>",
        "sentenceStructure": "<description>"
      },
      "emotionalTone": "<description>",
      "catchphrases": ["<phrase 1>", "<phrase 2>"],
      "speakingContext": ["<context 1>", "<context 2>"],
      "sampleQuotes": ["<quote 1>", ..., "<quote 6-8>"],
      "confidence": <0.0-1.0>
    }
  ]
}
\`\`\`

# QUALITY CONSTRAINTS
- Use confidence >0.8 ONLY for very distinct voices
- If uncertain between 2-3 speakers, list all (better over-identify than miss)
- Include background speakers if they speak ≥3 sentences
- Describe accents/tone in English for consistency

# EXAMPLE
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
      "inferredIdentity": "News Anchor",
      "speakingStyle": {"formality": "formal", "vocabulary": "professional broadcast terminology", "sentenceStructure": "complex"},
      "emotionalTone": "calm, confident",
      "catchphrases": ["Welcome to the show", "Let's dive into"],
      "speakingContext": ["introducing topics", "asking questions"],
      "sampleQuotes": ["Welcome to the show tonight.", "Let's bring in our guest.", "That's an excellent point."],
      "confidence": 0.95
    }
  ]
}
\`\`\`
`;

/**
 * Generate translation batch prompt
 */
export const getTranslationBatchPrompt = (batchLength: number, payload: any[]): string => `
    # INPUT DATA
    Input JSON (${batchLength} subtitle segments):
    ${JSON.stringify(payload)}

    # TASK
    Based on the ${batchLength} subtitle segments above, translate to Simplified Chinese.

    # RULES (Priority Order)
    [P1 - ACCURACY] Complete and Accurate Translation
    → Translate all ${batchLength} items (one-to-one mapping with input IDs)
    → Ensure no meaning is lost from source text
    → ID matching is critical - do not skip any ID
    → Output exactly ${batchLength} items in the response
    
    [P2 - QUALITY] Translation Excellence
    → Remove filler words and stuttering (uh, um, 呃, 嗯, etc.)
    → Produce fluent, natural Simplified Chinese
    → Use terminology from system instruction if provided
    → Maintain appropriate tone and style
    
    [P3 - OUTPUT] Format Requirements
    → 'text_translated' MUST BE in Simplified Chinese
    → Never output English, Japanese, or other languages in 'text_translated'
    → Maintain exact ID values from input

    # FINAL VERIFICATION
    ✓ All ${batchLength} IDs present in output
    ✓ All translations are Simplified Chinese
    ✓ No meaning lost from original text
    ✓ Filler words removed

    Now process the input JSON above following all rules.
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
}

/**
 * Generate fix timestamps prompt
 */
export const getFixTimestampsPrompt = (params: FixTimestampsPromptParams): string => `
    # INPUT DATA
    Batch ${params.batchLabel}. Previous batch ended at: "${params.lastEndTime}"
    ${params.glossaryContext}
    ${params.specificInstruction}

    Input JSON:
    ${JSON.stringify(params.payload)}

    # TASK
    Based on the audio and subtitles above, align timestamps and perform segmentation.

    # RULES (Priority Order)
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

    # FINAL VERIFICATION
    ✓ All timestamps aligned to audio
    ✓ Long segments split appropriately  
    ✓ No missed speech
    ✓ 'text_translated' completely unchanged

    Now process the input JSON above following all rules.
        `;

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
    # INPUT DATA
    Batch ${params.batchLabel}. Previous batch ended at: "${params.lastEndTime}"
    Total video duration: ${params.totalVideoDuration ? formatTime(params.totalVideoDuration) : 'Unknown'}
    ${params.glossaryContext}
    ${params.specificInstruction}

    Current Subtitles JSON:
    ${JSON.stringify(params.payload)}

    # TASK
    Based on the audio and subtitles above, improve translation quality.

    # RULES (Priority Order)
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

    # FINAL VERIFICATION
    ✓ All 'text_translated' are fluent Simplified Chinese
    ✓ No missed meaning from 'text_original'
    ✓ No missed speech from audio
    ✓ Translation quality significantly improved

    Now process the input JSON above following all rules.
        `;

/**
 * Parameters for refinement prompt
 */
export interface RefinementPromptParams {
  genre: string;
  rawSegments: any[];
  glossaryInfo: string;
  enableDiarization: boolean;
}

/**
 * Generate refinement prompt for transcription refinement
 */
export const getRefinementPrompt = (params: RefinementPromptParams): string => `
            # INPUT DATA
            Genre: ${params.genre}
            ${params.glossaryInfo}

            Input Transcription (JSON):
            ${JSON.stringify(params.rawSegments.map(s => ({ start: s.startTime, end: s.endTime, text: s.original })))}

            # TASK
            Based on the audio and transcription above, refine the raw OpenAI Whisper output.

            # RULES (Priority Order)
            [P1 - ACCURACY] Audio-Based Correction
            → Listen carefully to the attached audio
            → Fix misrecognized words and phrases in 'text'
            → Verify timing accuracy of 'start' and 'end' timestamps
            ${params.glossaryInfo ? `→ Pay special attention to key terminology listed in context` : ''}

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
            ${params.enableDiarization ? `→ INCLUDE "speaker" field for every segment (e.g., "Speaker 1")` : ''}

            # FINAL VERIFICATION
            ✓ Long segments (>4s or >25 chars) properly split
            ✓ Timestamps are relative to chunk start
            ✓ Terminology from glossary is used correctly
            ${params.glossaryInfo ? `✓ Checked against glossary terms` : ''}

            Now process the input transcription above following all rules.
            `;
