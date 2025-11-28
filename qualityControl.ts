/**
 * Quality Control Pipeline Implementation
 * 
 * Implements a three-stage Review→Fix→Validate pipeline for subtitle quality control
 * with automatic iteration until acceptance criteria are met or max iterations reached.
 */

import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";
import {
    SubtitleItem,
    SubtitleIssue,
    QualityControlConfig,
    IssueSeverity,
    ModelConfig
} from "./types";
import {
    executePipeline,
    PipelineConfig,
    createStage,
} from "./pipeline";
import { blobToBase64, sliceAudioBuffer, extractJsonArray, logger, formatTime, timeToSeconds } from "./utils";
import { ConsistencyValidator, ConsistencyIssue } from "./consistencyValidation";
import { checkGlobalConsistency } from "./gemini";

// --- Issue Analysis ---

/**
 * Convert ConsistencyIssue to SubtitleIssue format for QC Pipeline
 */
function convertConsistencyIssue(
    issue: ConsistencyIssue,
    roundNumber: number
): SubtitleIssue {
    // Map consistency issue types to SubtitleIssue types
    const typeMap: Record<ConsistencyIssue['type'], SubtitleIssue['type']> = {
        'punctuation': 'other',
        'spacing': 'other',
        'length': 'other',
        'brackets': 'other',
        'ai_consistency': 'incorrect_translation',
        'other': 'other'
    };

    return {
        id: `consistency-${roundNumber}-${issue.segmentId}`,
        type: typeMap[issue.type],
        segmentIndex: 0, // Placeholder, actual index determined by segmentId
        segmentId: issue.segmentId,
        timestamp: '00:00:00', // Placeholder
        description: `[Consistency] ${issue.description}`,
        severity: issue.severity,
        roundIdentified: roundNumber
    };
}

export interface QCStageInput {
    subtitles: SubtitleItem[];
    audioBase64: string;
    audioOffset: number;
    previousIssues?: SubtitleIssue[];
    genre: string;
}

export interface ReviewStageOutput {
    issues: SubtitleIssue[];
    metadata: {
        reviewDuration: number;
        model: string;
    };
}

export interface FixStageOutput {
    fixedSubtitles: SubtitleItem[];
    appliedFixes: string[];
    metadata: {
        fixDuration: number;
        model: string;
    };
}

export interface ValidateStageOutput {
    newIssues: SubtitleIssue[];
    resolvedIssues: string[];
    unresolvedIssues: string[];
    passedValidation: boolean;
    metadata: {
        validateDuration: number;
        model: string;
        analysis: { passed: boolean; high: number; mediumLow: number; rate: number };
    };
}

/**
 * Analyze issues to determine if acceptance criteria are met
 */
export function analyzeIssues(
    issues: SubtitleIssue[],
    criteria: QualityControlConfig['acceptanceCriteria'],
    durationMinutes: number
): { passed: boolean; high: number; mediumLow: number; rate: number } {
    const high = issues.filter(i => i.severity === 'high').length;
    const mediumLow = issues.filter(i => i.severity === 'medium' || i.severity === 'low').length;
    const rate = durationMinutes > 0 ? mediumLow / durationMinutes : mediumLow;

    const passed =
        high <= criteria.maxHighSeverityIssues &&
        rate <= criteria.maxMediumLowIssuesPerMinute;

    return { passed, high, mediumLow, rate };
}

/**
 * Parse issues from model response and convert relative timestamps to absolute
 */
function parseIssuesFromResponse(response: string, roundNumber: number, audioOffset: number): SubtitleIssue[] {
    try {
        const jsonStr = extractJsonArray(response);
        if (!jsonStr) {
            logger.warn('No JSON found in review response');
            return [];
        }

        const parsed = JSON.parse(jsonStr);
        const issuesArray = Array.isArray(parsed) ? parsed : parsed.issues || [];

        return issuesArray.map((issue: any, idx: number) => {
            // Convert relative timestamp to absolute
            let absoluteTimestamp = '00:00:00,000';
            if (issue.timestamp) {
                try {
                    absoluteTimestamp = formatTime(timeToSeconds(issue.timestamp) + audioOffset);
                } catch (e) {
                    // Keep original if parse fails
                    absoluteTimestamp = issue.timestamp;
                }
            }

            return {
                id: `issue-${roundNumber}-${idx}`,
                type: issue.type || 'other',
                segmentIndex: issue.segmentIndex || issue.segment_index || 0,
                segmentId: issue.segmentId || issue.segment_id,
                timestamp: absoluteTimestamp,
                description: issue.description || '',
                severity: (issue.severity || 'medium') as IssueSeverity,
                roundIdentified: roundNumber,
            };
        });
    } catch (err) {
        logger.error('Failed to parse issues:', err);
        return [];
    }
}

/**
 * Parse fixed subtitles from model response and convert relative timestamps to absolute
 */
function parseFixedSubtitles(response: string, originalSubtitles: SubtitleItem[], audioOffset: number): SubtitleItem[] {
    try {
        const jsonStr = extractJsonArray(response);
        if (!jsonStr) {
            logger.warn('No JSON found in fix response, returning original');
            return originalSubtitles;
        }

        const parsed = JSON.parse(jsonStr);
        const subtitlesArray = Array.isArray(parsed) ? parsed : parsed.subtitles || [];

        return subtitlesArray.map((sub: any) => ({
            id: sub.id || 0,
            startTime: formatTime(timeToSeconds(sub.start || sub.startTime || '00:00:00,000') + audioOffset),
            endTime: formatTime(timeToSeconds(sub.end || sub.endTime || '00:00:00,000') + audioOffset),
            original: sub.text_original || sub.original || '',
            translated: sub.text_translated || sub.translated || '',
            comment: sub.comment,
        }));
    } catch (err) {
        logger.error('Failed to parse fixed subtitles:', err);
        return originalSubtitles;
    }
}

// --- Schemas ---

const REVIEW_SCHEMA = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            type: { type: Type.STRING },
            segmentIndex: { type: Type.INTEGER },
            segmentId: { type: Type.INTEGER },
            timestamp: { type: Type.STRING },
            description: { type: Type.STRING },
            severity: { type: Type.STRING }
        },
        required: ["type", "description", "severity"]
    }
};

const FIX_SCHEMA = {
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

const VALIDATE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        resolvedIssueIds: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
        },
        unresolvedIssueIds: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
        },
        newIssues: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    type: { type: Type.STRING },
                    segmentIndex: { type: Type.INTEGER },
                    segmentId: { type: Type.INTEGER },
                    timestamp: { type: Type.STRING },
                    description: { type: Type.STRING },
                    severity: { type: Type.STRING }
                },
                required: ["type", "description", "severity"]
            }
        }
    },
    required: ["resolvedIssueIds", "unresolvedIssueIds", "newIssues"]
};

/**
 * Convert Gemini responseSchema to OpenAI JSON Schema format
 */
function convertGeminiSchemaToOpenAI(geminiSchema: any): any {
    if (!geminiSchema) return undefined;

    const convert = (schema: any): any => {
        if (!schema.type) return schema;

        const result: any = {};

        // Map Gemini Type to JSON Schema type
        switch (schema.type) {
            case Type.ARRAY:
                result.type = 'array';
                if (schema.items) {
                    result.items = convert(schema.items);
                }
                break;
            case Type.OBJECT:
                result.type = 'object';
                if (schema.properties) {
                    result.properties = {};
                    for (const [key, value] of Object.entries(schema.properties)) {
                        result.properties[key] = convert(value);
                    }
                }
                if (schema.required) {
                    result.required = schema.required;
                }
                result.additionalProperties = false;
                break;
            case Type.STRING:
                result.type = 'string';
                if (schema.description) result.description = schema.description;
                break;
            case Type.INTEGER:
                result.type = 'integer';
                if (schema.description) result.description = schema.description;
                break;
            case Type.NUMBER:
                result.type = 'number';
                if (schema.description) result.description = schema.description;
                break;
            case Type.BOOLEAN:
                result.type = 'boolean';
                if (schema.description) result.description = schema.description;
                break;
            default:
                return schema;
        }

        return result;
    };

    return convert(geminiSchema);
}

/**
 * Call AI model with retry logic
 */
async function callModel(
    modelConfig: ModelConfig,
    systemPrompt: string,
    userPrompt: string,
    responseSchema?: any,
    audioBase64?: string,
    apiKeys?: { gemini?: string; openai?: string }
): Promise<string> {
    logger.debug(`[QC] Calling Model: ${modelConfig.modelName} (${modelConfig.provider})`, { systemPrompt, userPrompt });
    if (audioBase64) logger.debug(`[QC] Audio attached (${Math.round(audioBase64.length / 1024)}KB)`);

    if (modelConfig.provider === 'gemini') {
        const apiKey = apiKeys?.gemini;
        if (!apiKey) throw new Error('Gemini API key not provided');

        const ai = new GoogleGenAI({ apiKey });

        const parts: any[] = [{ text: userPrompt }];
        if (audioBase64) {
            parts.push({
                inlineData: {
                    mimeType: 'audio/wav',
                    data: audioBase64,
                },
            });
        }

        const config: any = {
            systemInstruction: systemPrompt,
            temperature: modelConfig.temperature ?? 1.0,
            maxOutputTokens: modelConfig.maxTokens ?? 65536,
        };

        // Add responseSchema if provided
        if (responseSchema) {
            config.responseMimeType = "application/json";
            config.responseSchema = responseSchema;
        }

        const response = await ai.models.generateContent({
            model: modelConfig.modelName,
            contents: [{ role: 'user', parts }],
            config
        });

        const text = response.text || "";
        logger.debug(`[QC] Model Response:`, { text });
        return text;
    } else if (modelConfig.provider === 'openai') {
        const apiKey = apiKeys?.openai;
        if (!apiKey) throw new Error('OpenAI API key not provided');

        const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

        // Convert Gemini schema to OpenAI JSON Schema format
        const convertedSchema = responseSchema ? convertGeminiSchemaToOpenAI(responseSchema) : undefined;

        // Prepare messages
        const messageContent: Array<any> = [{ type: 'text', text: userPrompt }];

        if (audioBase64) {
            messageContent.push({
                type: 'input_audio',
                input_audio: {
                    data: audioBase64,
                    format: 'wav'
                }
            });
        }

        // Retry logic for OpenAI
        let lastError: any;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const config: any = {
                    model: modelConfig.modelName,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: messageContent }
                    ],
                    temperature: modelConfig.temperature ?? 1.0,
                    max_tokens: modelConfig.maxTokens ?? 65536,
                };

                // Add structured output if schema provided
                if (convertedSchema) {
                    config.response_format = {
                        type: 'json_schema',
                        json_schema: {
                            name: 'response',
                            strict: true,
                            schema: convertedSchema
                        }
                    };
                }

                const response = await openai.chat.completions.create(config);
                const text = response.choices[0]?.message?.content || "";
                logger.debug(`[QC] Model Response:`, { text });
                return text;
            } catch (e: any) {
                lastError = e;
                const isRateLimit = e.status === 429 || e.code === 'rate_limit_exceeded';
                const isServerError = e.status === 503 || e.status === 500;

                if ((isRateLimit || isServerError) && attempt < 2) {
                    const delay = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
                    logger.warn(`OpenAI API error (${e.status}). Retrying in ${Math.round(delay)}ms...`);
                    await new Promise(r => setTimeout(r, delay));
                } else {
                    throw e;
                }
            }
        }
        throw lastError;
    } else {
        throw new Error(`Unknown provider: ${modelConfig.provider}`);
    }
}

// --- Helper to convert subtitles to relative time ---
function toRelativeSubtitles(subtitles: SubtitleItem[], offset: number): any[] {
    return subtitles.map(s => ({
        ...s,
        startTime: formatTime(Math.max(0, timeToSeconds(s.startTime) - offset)),
        endTime: formatTime(Math.max(0, timeToSeconds(s.endTime) - offset))
    }));
}

// --- Helper to convert issues to relative time ---
function toRelativeIssues(issues: SubtitleIssue[], offset: number): any[] {
    return issues.map(i => ({
        ...i,
        timestamp: formatTime(Math.max(0, timeToSeconds(i.timestamp) - offset))
    }));
}

// --- Pipeline Stages ---

/**
 * Stage 1: Review - Analyze audio + subtitles to identify issues
 */
export function createReviewStage(
    config: QualityControlConfig,
    apiKeys: { gemini?: string; openai?: string },
    getPrompt: (genre: string) => string
) {
    return createStage<QCStageInput, ReviewStageOutput, any>(
        'Review',
        async (input, context) => {
            logger.info(`[QC] Starting Review Stage (Iteration ${context.iteration})`);
            const startTime = Date.now();
            const allIssues: SubtitleIssue[] = [];

            // === STEP 1: Rule-Based Consistency Check (Fast, local) ===
            logger.debug('[QC Review] Running rule-based consistency check...');
            try {
                const ruleIssues = ConsistencyValidator.validate(input.subtitles);
                const convertedRuleIssues = ruleIssues.map(issue =>
                    convertConsistencyIssue(issue, context.iteration)
                );
                allIssues.push(...convertedRuleIssues);
                logger.debug(`[QC Review] Found ${ruleIssues.length} rule-based consistency issues`);
            } catch (e) {
                logger.warn('[QC Review] Rule-based consistency check failed:', e);
            }

            // === STEP 2: AI-Based Consistency Check (Semantic analysis) ===
            logger.debug('[QC Review] Running AI-based consistency check...');
            if (apiKeys.gemini) {
                try {
                    const aiConsistencyIssues = await checkGlobalConsistency(
                        input.subtitles,
                        apiKeys.gemini,
                        input.genre
                    );
                    const convertedAiIssues = aiConsistencyIssues.map(issue =>
                        convertConsistencyIssue(issue, context.iteration)
                    );
                    allIssues.push(...convertedAiIssues);
                    logger.debug(`[QC Review] Found ${aiConsistencyIssues.length} AI-based consistency issues`);
                } catch (e) {
                    logger.warn('[QC Review] AI-based consistency check failed:', e);
                }
            } else {
                logger.info('[QC Review] Skipping AI consistency check (no Gemini API key)');
            }

            // === STEP 3: Main Audio-Based Review ===
            logger.debug('[QC Review] Running audio-based review...');

            // Convert subtitles to relative time for AI context
            const relativeSubtitles = toRelativeSubtitles(input.subtitles, input.audioOffset);

            const userPrompt = `
Genre/Context: ${input.genre}

You are reviewing the following subtitles with the provided audio.

NOTE: Rule-based and AI-based consistency checks have already identified ${allIssues.length} issues.
Focus on audio-text alignment and translation quality issues not caught by those checks.

Listen carefully and identify ALL issues with:
1. **Timing misalignment**: Subtitles appearing too early/late
2. **Missing content**: Speech in audio but not in text
3. **Incorrect translation**: Mistranslations or missed meaning
4. **Sync errors**: Subtitles bunched up or spread incorrectly

Subtitles (Timestamps relative to audio start):
${JSON.stringify(relativeSubtitles, null, 2)}

Return a JSON array of issues in this exact format:
\`\`\`json
[
  {
    "type": "timing_misalignment" | "missing_content" | "incorrect_translation" | "sync_error",
    "segmentIndex": 0,
    "segmentId": 123,
    "timestamp": "00:01:23",
    "description": "Clear description of the issue",
    "severity": "high" | "medium" | "low"
  }
]
\`\`\`

Severity guidelines:
- **high**: Affects comprehension (wrong timing by >500ms, missing lines, major mistranslation)
- **medium**: Affects experience (timing off by 100-500ms, minor mistranslation, awkward phrasing)
- **low**: Minor quality issues (timing off by <100ms, punctuation, style)
`;

            const systemPrompt = getPrompt(input.genre);
            const response = await callModel(
                config.reviewModel,
                systemPrompt,
                userPrompt,
                REVIEW_SCHEMA,
                input.audioBase64,
                apiKeys
            );

            // Parse issues and convert timestamps back to absolute
            const reviewIssues = parseIssuesFromResponse(response, context.iteration, input.audioOffset);
            allIssues.push(...reviewIssues);

            logger.info(`[QC Review] Total issues found: ${allIssues.length} (${allIssues.filter(i => i.severity === 'high').length} high, ${allIssues.filter(i => i.severity === 'medium').length} medium, ${allIssues.filter(i => i.severity === 'low').length} low)`);

            return {
                issues: allIssues,
                metadata: {
                    reviewDuration: Date.now() - startTime,
                    model: config.reviewModel.modelName,
                },
            };
        }
    );
}

/**
 * Stage 2: Fix - Apply corrections based on identified issues
 */
export function createFixStage(
    config: QualityControlConfig,
    apiKeys: { gemini?: string; openai?: string },
    getPrompt: (genre: string, issues: SubtitleIssue[]) => string
) {
    return createStage<ReviewStageOutput & QCStageInput, FixStageOutput, any>(
        'Fix',
        async (input, context) => {
            logger.info(`[QC] Starting Fix Stage (Iteration ${context.iteration})`);
            const startTime = Date.now();

            // Convert to relative time for AI context
            const relativeSubtitles = toRelativeSubtitles(input.subtitles, input.audioOffset);
            const relativeIssues = toRelativeIssues(input.issues, input.audioOffset);

            const userPrompt = `
Genre/Context: ${input.genre}

You identified the following issues (Timestamps relative to audio start):
${JSON.stringify(relativeIssues, null, 2)}

Original subtitles (Timestamps relative to audio start):
${JSON.stringify(relativeSubtitles, null, 2)}

Now FIX these issues. Listen to the audio and return the CORRECTED subtitles.

CRITICAL RULES:
1. Address EVERY issue listed above
2. Maintain subtitle IDs
3. Ensure startTime < endTime
4. "text_translated" MUST be Simplified Chinese
5. Return valid JSON in this exact format:

\`\`\`json
[
  {
    "id": 1,
    "start": "00:00:01,500",
    "end": "00:00:03,200",
    "text_original": "Original text",
    "text_translated": "翻译文本"
  }
]
\`\`\`
`;

            const systemPrompt = getPrompt(input.genre, input.issues);
            const response = await callModel(
                config.fixModel,
                systemPrompt,
                userPrompt,
                FIX_SCHEMA,
                input.audioBase64,
                apiKeys
            );

            // Parse fixed subtitles and convert timestamps back to absolute
            const fixedSubtitles = parseFixedSubtitles(response, input.subtitles, input.audioOffset);

            const changedIds = fixedSubtitles.filter(f => {
                const o = input.subtitles.find(s => s.id === f.id);
                return o && (o.translated !== f.translated || o.startTime !== f.startTime || o.endTime !== f.endTime);
            }).map(f => f.id);

            logger.info(`[QC] Fix Complete. Applied fixes to ${input.issues.length} issues. Modified Subtitles: [${changedIds.join(', ')}]`);

            return {
                fixedSubtitles,
                appliedFixes: input.issues.map(i => i.id),
                metadata: {
                    fixDuration: Date.now() - startTime,
                    model: config.fixModel.modelName,
                },
            };
        }
    );
}

/**
 * Stage 3: Validate - Verify fixes and identify remaining/new issues
 */
export function createValidateStage(
    config: QualityControlConfig,
    apiKeys: { gemini?: string; openai?: string },
    getPrompt: (genre: string, originalIssues: SubtitleIssue[]) => string,
    durationMinutes: number
) {
    return createStage<FixStageOutput & QCStageInput, ValidateStageOutput, any>(
        'Validate',
        async (input, context) => {
            logger.info(`[QC] Starting Validate Stage (Iteration ${context.iteration})`);
            const startTime = Date.now();

            // Convert to relative time for AI context
            const relativeSubtitles = toRelativeSubtitles(input.fixedSubtitles, input.audioOffset);
            const relativePreviousIssues = toRelativeIssues(input.previousIssues || [], input.audioOffset);

            const userPrompt = `
Genre/Context: ${input.genre}

VALIDATION TASK:

Original issues that were supposed to be fixed (Timestamps relative to audio start):
${JSON.stringify(relativePreviousIssues, null, 2)}

Current subtitles (after fix attempt, Timestamps relative to audio start):
${JSON.stringify(relativeSubtitles, null, 2)}

Your job:
1. Listen to the audio
2. Check if the original issues were ACTUALLY FIXED
3. Identify any NEW issues introduced
4. Return results in JSON format

Return this exact structure:
\`\`\`json
{
  "resolvedIssueIds": ["issue-1-0", "issue-1-2"],
  "unresolvedIssueIds": ["issue-1-1"],
  "newIssues": [
    {
      "type": "timing_misalignment",
      "segmentIndex": 5,
      "timestamp": "00:02:15",
      "description": "New issue found",
      "severity": "medium"
    }
  ]
}
\`\`\`
`;

            const systemPrompt = getPrompt(input.genre, input.previousIssues || []);
            const response = await callModel(
                config.validateModel,
                systemPrompt,
                userPrompt,
                VALIDATE_SCHEMA,
                input.audioBase64,
                apiKeys
            );

            // Parse validation response
            let resolved: string[] = [];
            let unresolved: string[] = [];
            let newIssues: SubtitleIssue[] = [];

            try {
                const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || response.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const result = JSON.parse(jsonMatch[1] || jsonMatch[0]);
                    resolved = result.resolvedIssueIds || result.resolved || [];
                    unresolved = result.unresolvedIssueIds || result.unresolved || [];
                    // Convert new issues timestamps to absolute
                    newIssues = parseIssuesFromResponse(JSON.stringify(result.newIssues || []), context.iteration, input.audioOffset);
                }
            } catch (err) {
                logger.error('Failed to parse validation response:', err);
            }

            // Combine unresolved and new issues
            const allIssues = [
                ...(input.previousIssues || []).filter(i => unresolved.includes(i.id)),
                ...newIssues,
            ];

            // Check acceptance criteria
            const analysis = analyzeIssues(allIssues, config.acceptanceCriteria, durationMinutes);
            logger.info(`[QC] Validation Complete. Passed: ${analysis.passed}. Remaining Issues: ${allIssues.length}`);

            return {
                newIssues,
                resolvedIssues: resolved,
                unresolvedIssues: unresolved,
                passedValidation: analysis.passed,
                metadata: {
                    validateDuration: Date.now() - startTime,
                    model: config.validateModel.modelName,
                    analysis,
                },
            };
        }
    );
}

// --- Main Pipeline Factory ---

export interface QCPipelineResult {
    finalSubtitles: SubtitleItem[];
    allIssues: SubtitleIssue[];
    iterations: number;
    passedValidation: boolean;
    history: any[];
}

/**
 * Create and execute a Quality Control pipeline
 */
export async function createQualityControlPipeline(
    subtitles: SubtitleItem[],
    selectedIndices: number[] | undefined,
    audioBuffer: AudioBuffer,
    audioOffset: number,
    config: QualityControlConfig,
    genre: string,
    apiKeys: { gemini?: string; openai?: string },
    prompts: {
        review: (genre: string) => string;
        fix: (genre: string, issues: SubtitleIssue[]) => string;
        validate: (genre: string, originalIssues: SubtitleIssue[]) => string;
    },
    callbacks?: {
        onProgress?: (stage: string, progress: number, message: string) => void;
        onIterationComplete?: (
            iteration: number,
            issues: SubtitleIssue[],
            subtitles: SubtitleItem[]
        ) => Promise<'continue' | 'accept' | 'cancel'>;
    }
): Promise<QCPipelineResult> {
    // Filter subtitles if batch selection provided
    const subsToCheck = selectedIndices
        ? selectedIndices.map(idx => subtitles[idx]).filter(Boolean)
        : subtitles;

    logger.info(`[QC] Pipeline Started`);
    logger.info(`[QC] Checking ${subsToCheck.length}/${subtitles.length} subtitles`);
    logger.debug(`[QC] Config: Max Iterations=${config.maxIterations}, Criteria=${JSON.stringify(config.acceptanceCriteria)}`);

    // Calculate audio duration for selected subtitles
    const firstSub = subsToCheck[0];
    const lastSub = subsToCheck[subsToCheck.length - 1];

    // Parse time helper
    const parseTime = (timeStr: string): number => {
        const [h, m, s] = timeStr.split(/[:,]/);
        return parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s);
    };

    const startTime = parseTime(firstSub.startTime);
    const endTime = parseTime(lastSub.endTime);

    // Slice audio to match selected subtitles
    // We add a small buffer (e.g. 1s) before and after if possible, but strict slicing is safer for alignment
    const blob = await sliceAudioBuffer(audioBuffer, startTime, endTime);
    const audioBase64 = await blobToBase64(blob);

    // Create stages
    const reviewStage = createReviewStage(config, apiKeys, prompts.review);
    const fixStage = createFixStage(config, apiKeys, prompts.fix);
    const validateStage = createValidateStage(config, apiKeys, prompts.validate, (endTime - startTime) / 60);

    // Mutable reference for the working copy of subtitles (starts with selected subset)
    let workingSubtitles = [...subsToCheck];

    // Pipeline configuration
    const pipelineConfig: PipelineConfig<QCStageInput, ValidateStageOutput, any> = {
        name: 'Quality Control',
        stages: [
            reviewStage as any,
            {
                ...fixStage,
                execute: async (input: any, context: any) => {
                    const reviewOutput = input as ReviewStageOutput;

                    // Store issues in context for later stages
                    context.data.currentIssues = reviewOutput.issues;

                    const stageInput = {
                        ...input,
                        subtitles: workingSubtitles, // Use current working copy
                        audioBase64,
                        audioOffset: startTime, // Update offset
                        genre,
                        issues: reviewOutput.issues,
                        previousIssues: reviewOutput.issues,
                    };
                    const result = await fixStage.execute(stageInput, context);

                    // Update working subtitles with the fixed result
                    workingSubtitles = result.output.fixedSubtitles;

                    return result;
                },
            } as any,
            {
                ...validateStage,
                execute: async (input: any, context: any) => {
                    const fixOutput = input as FixStageOutput;
                    const stageInput = {
                        ...input,
                        subtitles: workingSubtitles, // Use current working copy
                        fixedSubtitles: workingSubtitles, // Use current working copy
                        audioBase64,
                        audioOffset: startTime, // Update offset
                        genre,
                        previousIssues: context.data.currentIssues || [],
                    };
                    const result = await validateStage.execute(stageInput, context);
                    return result;
                },
            } as any,
        ],
        maxIterations: config.maxIterations,
        shouldContinue: async (output, iteration) => {
            return !output.passedValidation && iteration < config.maxIterations;
        },
        onIterationComplete: callbacks?.onIterationComplete
            ? async (iteration, output, context) => {
                const allIssues = [
                    ...(output.newIssues || []),
                ];
                return callbacks.onIterationComplete!(iteration, allIssues, workingSubtitles);
            }
            : undefined,
        onProgress: callbacks?.onProgress,
    };

    // Execute pipeline
    const initialInput: QCStageInput = {
        subtitles: subsToCheck,
        audioBase64,
        audioOffset: startTime,
        genre,
    };

    const result = await executePipeline(pipelineConfig, initialInput, {
        currentIssues: [],
    });

    // Extract final issues from last validation
    const lastIteration = result.history[result.history.length - 1];
    const lastOutput = lastIteration?.output as ValidateStageOutput;

    const allIssues: SubtitleIssue[] = [
        ...(lastOutput?.newIssues || []),
    ];

    // Construct Final Subtitles using Splice Strategy
    let finalSubtitles = [...subtitles];

    if (selectedIndices && selectedIndices.length > 0) {
        // Sort indices to find the range
        const sortedIndices = [...selectedIndices].sort((a, b) => a - b);
        const startIdx = sortedIndices[0];
        const endIdx = sortedIndices[sortedIndices.length - 1];

        // Splice Strategy:
        // Replace the entire range [startIdx, endIdx] with workingSubtitles.
        // This handles splitting (workingSubtitles > range) and merging (workingSubtitles < range).
        // It assumes the user selected a contiguous block. 
        // If there were gaps in selection, they are overwritten by the QC result of the block.

        const before = subtitles.slice(0, startIdx);
        const after = subtitles.slice(endIdx + 1);

        finalSubtitles = [...before, ...workingSubtitles, ...after].map((s, i) => ({ ...s, id: i + 1 }));
    } else {
        // If no selection (all subtitles), just replace everything
        finalSubtitles = workingSubtitles.map((s, i) => ({ ...s, id: i + 1 }));
    }

    return {
        finalSubtitles,
        allIssues,
        iterations: result.iterations,
        passedValidation: result.output?.passedValidation ?? false,
        history: result.history,
    };
}
