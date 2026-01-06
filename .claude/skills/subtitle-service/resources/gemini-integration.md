# Gemini API Integration

## Client Setup

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export function getGeminiModel(modelName: string = 'gemini-1.5-flash') {
  return genAI.getGenerativeModel({ model: modelName });
}
```

## Translation Prompt Structure

### System Prompt

```typescript
const TRANSLATION_SYSTEM_PROMPT = `You are an expert subtitle translator.

TASK: Translate subtitles from {sourceLanguage} to {targetLanguage}.

RULES:
1. Preserve the meaning and tone of the original
2. Keep translations concise (subtitles have limited space)
3. Use natural {targetLanguage} expressions
4. Maintain consistency with the provided glossary
5. Preserve any speaker identification
6. Do not add or remove information

GLOSSARY (use these translations):
{glossary}

OUTPUT FORMAT:
Return translations in the exact same order as input.
Each line should be: [index]: [translated text]
`;
```

### Request Structure

```typescript
interface TranslationRequest {
  entries: SubtitleEntry[];
  sourceLanguage: string;
  targetLanguage: string;
  glossary: Record<string, string>;
  context?: string;
}

export async function translateChunk(request: TranslationRequest): Promise<SubtitleEntry[]> {
  const model = getGeminiModel('gemini-1.5-flash');

  const prompt = buildTranslationPrompt(request);

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3, // Lower for consistency
      topP: 0.8,
      maxOutputTokens: 4096,
    },
  });

  const response = result.response.text();
  return parseTranslationResponse(response, request.entries);
}
```

## Glossary Extraction

```typescript
const GLOSSARY_EXTRACTION_PROMPT = `Analyze the following subtitles and extract key terms that should be translated consistently.

Focus on:
- Proper nouns (names, places, organizations)
- Technical terms
- Recurring phrases
- Cultural references

Return as JSON: { "term": "suggested translation", ... }

Subtitles:
{subtitles}
`;

export async function extractGlossary(
  entries: SubtitleEntry[],
  targetLanguage: string
): Promise<Record<string, string>> {
  const model = getGeminiModel('gemini-1.5-pro');

  const prompt = GLOSSARY_EXTRACTION_PROMPT.replace(
    '{subtitles}',
    entries.map((e) => e.text).join('\n')
  );

  const result = await model.generateContent(prompt);
  const response = result.response.text();

  // Extract JSON from response
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return {};

  return JSON.parse(jsonMatch[0]);
}
```

## Error Handling

```typescript
import { GoogleGenerativeAIError } from '@google/generative-ai';

export async function safeGeminiCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof GoogleGenerativeAIError) {
      if (error.message.includes('RATE_LIMIT')) {
        // Wait and retry
        await new Promise((r) => setTimeout(r, 60000));
        return fn();
      }

      if (error.message.includes('SAFETY')) {
        throw new Error('Content blocked by safety filters');
      }
    }

    throw error;
  }
}
```

## Rate Limiting

```typescript
const rateLimiter = new Semaphore(5); // 5 concurrent requests

export async function rateLimitedTranslate(entries: SubtitleEntry[]): Promise<SubtitleEntry[]> {
  await rateLimiter.acquire();

  try {
    return await translateChunk({ entries /* ... */ });
  } finally {
    rateLimiter.release();
  }
}
```

## Response Parsing

```typescript
export function parseTranslationResponse(
  response: string,
  originalEntries: SubtitleEntry[]
): SubtitleEntry[] {
  const lines = response.split('\n').filter((line) => line.trim());

  return originalEntries.map((entry, index) => {
    // Find matching line
    const pattern = new RegExp(`^\\[?${index}\\]?[:\\s]+(.+)$`);
    const match = lines.find((line) => pattern.test(line));

    if (match) {
      const translated = match.replace(pattern, '$1').trim();
      return { ...entry, translatedText: translated };
    }

    return entry;
  });
}
```
