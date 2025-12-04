import { SubtitleItem, GeminiSubtitleSchema } from '@/types/subtitle';
import { timeToSeconds, normalizeTimestamp, formatTime } from './time';

export const parseSrt = (content: string): SubtitleItem[] => {
    const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const blocks = normalized.split(/\n\n+/);
    const items: SubtitleItem[] = [];

    blocks.forEach((block) => {
        const lines = block.trim().split('\n');
        if (lines.length < 3) return;

        // Line 1: ID
        // Line 2: Time
        // Line 3+: Text

        // Sometimes index 0 is empty if file starts with newlines
        let startIndex = 0;
        if (!lines[0].match(/^\d+$/) && lines[1]?.match(/^\d+$/)) startIndex = 1;

        // Check if it looks like a valid block
        const timeLine = lines[startIndex + 1];
        if (!timeLine || !timeLine.includes('-->')) return;

        const [start, end] = timeLine.split('-->').map(t => t.trim());
        const textLines = lines.slice(startIndex + 2);

        // Heuristic for Bilingual SRT:
        // If we have multiple lines, we try to split them.
        // Case 1: 2 lines -> Line 1 = Original, Line 2 = Translated
        // Case 2: Even number of lines -> First half = Original, Second half = Translated
        // Case 3: Odd number of lines > 1 -> First line = Original, Rest = Translated (or vice versa? Let's assume 1st line is Source)
        // Fallback: All to Original

        let original = "";
        let translated = "";

        if (textLines.length === 2) {
            original = textLines[0];
            translated = textLines[1];
        } else if (textLines.length > 2 && textLines.length % 2 === 0) {
            const mid = textLines.length / 2;
            original = textLines.slice(0, mid).join('\n');
            translated = textLines.slice(mid).join('\n');
        } else {
            // Default fallback or odd lines: Treat all as original for now, 
            // OR if user specifically wants "New Project" style which is usually 1 line orig / 1 line trans
            // Let's try to detect if it looks like a split.
            // For now, let's just put everything in original if it's ambiguous, 
            // BUT the user specifically asked to support "generated format".
            // The generated format is `Original\nTranslated`.
            // So if there are multiple lines, we should try to split.
            if (textLines.length > 1) {
                // Simple split: First line original, rest translated? 
                // Or maybe the user edited it to be multi-line.
                // Let's stick to the "Split in half" heuristic if possible, otherwise just 1st line vs rest.
                original = textLines[0];
                translated = textLines.slice(1).join('\n');
            } else {
                original = textLines.join('\n');
            }
        }

        // --- Speaker Extraction Logic ---
        // Format: "Speaker Name: Content"
        // We check both original and translated lines.
        // If both have the same speaker, we extract it.
        // If only one has it, we extract it.
        // If they differ, we prefer the one from 'original' (or maybe just take the first one found).

        let speaker: string | undefined = undefined;

        const extractSpeaker = (text: string): { speaker?: string, content: string } => {
            const match = text.match(/^(.+?):\s+(.*)$/s); // Use 's' flag for dotAll if needed, but here we process line by line usually. 
            // Actually text might be multiline.
            // The export format puts "Speaker: " at the beginning of the block if it's there.
            // But wait, if it's multiline, does every line have speaker? No, usually just the first line of the block.
            // Let's check the very start of the string.
            const matchFirst = text.match(/^(.+?):\s+(.*)$/s);
            if (matchFirst) {
                return { speaker: matchFirst[1], content: matchFirst[2] };
            }
            return { content: text };
        };

        const origRes = extractSpeaker(original);
        const transRes = extractSpeaker(translated);

        if (origRes.speaker) {
            speaker = origRes.speaker;
            original = origRes.content;
        }

        // If translated also has speaker, remove it. 
        // If we didn't find speaker in original (rare if bilingual export), take it from translated.
        if (transRes.speaker) {
            if (!speaker) speaker = transRes.speaker;
            translated = transRes.content;
        }

        items.push({
            id: items.length + 1,
            startTime: normalizeTimestamp(start),
            endTime: normalizeTimestamp(end),
            original: original,
            translated: translated,
            speaker: speaker
        });
    });
    return items;
};

export const parseAss = (content: string): SubtitleItem[] => {
    const lines = content.split(/\r?\n/);
    const items: SubtitleItem[] = [];
    let format: string[] = [];

    // Find Events section
    let inEvents = false;

    lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed === '[Events]') {
            inEvents = true;
            return;
        }
        if (!inEvents) return;

        if (trimmed.startsWith('Format:')) {
            format = trimmed.substring(7).split(',').map(s => s.trim().toLowerCase());
            return;
        }

        if (trimmed.startsWith('Dialogue:')) {
            if (format.length === 0) return; // Need format first

            const parts = trimmed.substring(9).split(',');
            if (parts.length > format.length) {
                // Join the last text parts back together because text can contain commas
                const textPart = parts.slice(format.length - 1).join(',');
                parts.splice(format.length - 1, parts.length - (format.length - 1), textPart);
            }

            const startIdx = format.indexOf('start');
            const endIdx = format.indexOf('end');
            const textIdx = format.indexOf('text');

            if (startIdx === -1 || endIdx === -1 || textIdx === -1) return;

            let rawText = parts[textIdx] || "";

            // Parse specific generator tags:
            // Format: {\rSecondary}ORIGINAL\N{\r}TRANSLATED
            // Or just TRANSLATED (if target_only)

            let original = "";
            let translated = "";

            // Check for our specific bilingual signature
            if (rawText.includes('{\\rSecondary}') && rawText.includes('{\\r}')) {
                // Extract Original
                const secondaryMatch = rawText.match(/{\\rSecondary}(.*?)(?:\\N)?{\\r}/);
                if (secondaryMatch) {
                    original = secondaryMatch[1];
                }

                // Extract Translated (everything after {\r})
                const mainMatch = rawText.split('{\\r}');
                if (mainMatch.length > 1) {
                    translated = mainMatch[1];
                }
            } else {
                // Fallback: Treat as Original (or maybe Translated? The user wants to see the "New Project" style)
                // If it's a plain ASS, usually it's just the subtitle text.
                // Let's put it in Original so it shows up at least.
                original = rawText;
            }

            // Clean up ASS tags from the extracted text
            const clean = (t: string) => t.replace(/{[^}]+}/g, '').replace(/\\N/g, '\n').trim();

            original = clean(original);
            translated = clean(translated);

            // --- Speaker Extraction Logic ---
            let speaker: string | undefined = undefined;

            const extractSpeaker = (text: string): { speaker?: string, content: string } => {
                const match = text.match(/^(.+?):\s+(.*)$/s);
                if (match) {
                    return { speaker: match[1], content: match[2] };
                }
                return { content: text };
            };

            const origRes = extractSpeaker(original);
            const transRes = extractSpeaker(translated);

            if (origRes.speaker) {
                speaker = origRes.speaker;
                original = origRes.content;
            }
            if (transRes.speaker) {
                if (!speaker) speaker = transRes.speaker;
                translated = transRes.content;
            }

            items.push({
                id: items.length + 1,
                startTime: normalizeTimestamp(parts[startIdx]),
                endTime: normalizeTimestamp(parts[endIdx]),
                original: original,
                translated: translated,
                speaker: speaker
            });
        }
    });
    return items;
};

export const extractJsonArray = (text: string): string | null => {
    const firstBracket = text.indexOf('[');
    if (firstBracket === -1) return null;

    let depth = 0;
    let inString = false;
    let escape = false;

    // Start scanning from the first bracket
    for (let i = firstBracket; i < text.length; i++) {
        const char = text[i];

        if (escape) {
            escape = false;
            continue;
        }

        if (char === '\\') {
            escape = true;
            continue;
        }

        if (char === '"') {
            inString = !inString;
            continue;
        }

        if (!inString) {
            if (char === '[') {
                depth++;
            } else if (char === ']') {
                depth--;
                if (depth === 0) {
                    return text.substring(firstBracket, i + 1);
                }
            }
        }
    }

    return null;
};

export const parseGeminiResponse = (jsonResponse: string | null | undefined, maxDuration?: number): SubtitleItem[] => {
    if (!jsonResponse) return [];
    try {
        const cleanJson = jsonResponse.replace(/```json/g, '').replace(/```/g, '').trim();

        // Robust extraction using state machine
        let jsonToParse = extractJsonArray(cleanJson);

        // Fallback to original behavior if extraction fails
        if (!jsonToParse) {
            if (cleanJson.startsWith('{')) {
                jsonToParse = cleanJson;
            } else {
                jsonToParse = cleanJson;
            }
        }

        let items: GeminiSubtitleSchema[] = [];
        let parsed: any;
        try {
            parsed = JSON.parse(jsonToParse);
        } catch (e) {
            // If strict parse fails, try to find the largest valid array-like structure?
            // Actually, extractJsonArray should have handled the "extra garbage" case.
            // If it failed, it means the JSON is likely truly broken or truncated.
            throw e;
        }

        if (Array.isArray(parsed)) {
            items = parsed;
        } else if (parsed && parsed.subtitles && Array.isArray(parsed.subtitles)) {
            items = parsed.subtitles;
        } else if (parsed && parsed.items && Array.isArray(parsed.items)) {
            items = parsed.items;
        }

        // Filter and map
        items = items.filter(item => {
            // Robust key access
            const rawOriginal = item.text_original || (item as any).original_text || (item as any).original || item.text || '';
            const rawTranslated = item.text_translated || (item as any).translated_text || (item as any).translated || (item as any).translation || '';

            // Mutate item to normalized keys for next step
            item.text_original = String(rawOriginal).trim();
            item.text_translated = String(rawTranslated).trim();
            return item.text_original.length > 0 || item.text_translated.length > 0;
        });

        return items.map((item, index) => {
            if (!item.start || !item.end) return null;

            // Validate Timestamps against maxDuration if provided
            // This prevents the "03:24:45" bug in a 20 min video
            if (maxDuration) {
                const startSec = timeToSeconds(item.start);
                if (startSec > maxDuration + 10) { // Allow small buffer
                    return null;
                }
            }

            let startStr = normalizeTimestamp(item.start, maxDuration);
            let endStr = normalizeTimestamp(item.end, maxDuration);

            let startSec = timeToSeconds(startStr);
            let endSec = timeToSeconds(endStr);

            if (startSec > endSec) {
                const tempSec = startSec; startSec = endSec; endSec = tempSec;
                startStr = formatTime(startSec); endStr = formatTime(endSec);
            }
            if (endSec - startSec < 0.5) {
                endSec = startSec + 1.5; endStr = formatTime(endSec);
            }
            return {
                id: index + 1,
                startTime: startStr,
                endTime: endStr,
                original: item.text_original || "",
                translated: item.text_translated || "",
                speaker: (item as any).speaker || undefined
            };
        }).filter(item => item !== null) as SubtitleItem[];

    } catch (e) {
        console.error("Failed to parse JSON from Gemini", e);
        return [];
    }
};
