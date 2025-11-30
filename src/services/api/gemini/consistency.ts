import { GoogleGenAI, Type } from "@google/genai";
import { SubtitleItem } from "@/types/subtitle";
import { ConsistencyIssue } from "@/consistencyValidation"; // Assuming path alias works or relative path
import { generateContentWithRetry } from "./client";
import { logger } from "@/services/utils/logger";

export const checkGlobalConsistency = async (
    subtitles: SubtitleItem[],
    apiKey: string,
    genre: string,
    timeout?: number
): Promise<ConsistencyIssue[]> => {
    if (!apiKey) throw new Error("Gemini API Key is missing.");
    const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { timeout: timeout || 600000 }
    });

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
                temperature: 1.0,
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
