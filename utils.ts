
import { SubtitleItem, OutputFormat, GeminiSubtitleSchema, OpenAIWhisperSegment } from './types';

// --- Time Formatting Utils ---

/**
 * Formats seconds to HH:MM:SS,mmm
 */
export const formatTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
};

/**
 * Parses HH:MM:SS,mmm or HH:MM:SS.mmm to seconds (float)
 */
export const timeToSeconds = (timeStr: string): number => {
  if (!timeStr) return 0;
  // Clean up
  const cleanStr = timeStr.replace(/[^0-9:.,]/g, '').replace('.', ',');
  const parts = cleanStr.split(':');

  let h = 0, m = 0, s = 0, ms = 0;

  if (parts.length === 3) {
    h = parseInt(parts[0], 10) || 0;
    m = parseInt(parts[1], 10) || 0;
    const s_parts = parts[2].split(',');
    s = parseInt(s_parts[0], 10) || 0;
    ms = parseInt((s_parts[1] || '0').padEnd(3, '0').slice(0, 3), 10) || 0;
  } else if (parts.length === 2) {
    m = parseInt(parts[0], 10) || 0;
    const s_parts = parts[1].split(',');
    s = parseInt(s_parts[0], 10) || 0;
    ms = parseInt((s_parts[1] || '0').padEnd(3, '0').slice(0, 3), 10) || 0;
  }

  return h * 3600 + m * 60 + s + (ms / 1000);
};

/**
 * Normalizes timestamp to strictly HH:MM:SS,mmm format for SRT/PotPlayer compatibility.
 */
export const normalizeTimestamp = (timeStr: string, maxDuration?: number): string => {
  if (!timeStr) return '00:00:00,000';

  const cleanStr = timeStr.replace(/[^0-9:.,]/g, '').replace('.', ',');
  let parts = cleanStr.split(':');

  let secondsPart = parts.pop() || '0';
  let minutesPart = parts.pop() || '0';
  let hoursPart = parts.pop() || '0';

  let [secsStr, msStr] = secondsPart.split(',');
  if (!msStr) msStr = '000';

  let h = parseInt(hoursPart, 10) || 0;
  let m = parseInt(minutesPart, 10) || 0;
  let s = parseInt(secsStr, 10) || 0;
  let ms = parseInt(msStr.padEnd(3, '0').slice(0, 3), 10) || 0;

  m += Math.floor(s / 60);
  s = s % 60;
  h += Math.floor(m / 60);
  m = m % 60;

  // Formatting complete, now basic validation if maxDuration provided
  if (maxDuration) {
    const totalSeconds = h * 3600 + m * 60 + s + (ms / 1000);
    if (totalSeconds > maxDuration + 30) {
      // If timestamp is way beyond duration (allowing 30s buffer), likely a parsing error or hallucination
      // Try to recover if it looks like hours were confused for minutes
      if (h > 0 && maxDuration < 3600) {
        // Heuristic: If video < 1 hour but we have hours, maybe shift down
        m += h * 60; // Wait, usually it's just wrong mapping. 
        h = 0;
      }
    }
  }

  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
};

/**
 * Converts normalized HH:MM:SS,mmm to ASS format H:MM:SS.cc
 */
export const toAssTime = (normalizedTime: string): string => {
  const [hms, ms] = normalizedTime.split(',');
  const [h, m, s] = hms.split(':');
  const cs = ms.slice(0, 2);
  const p2 = (n: string) => n.padStart(2, '0').slice(-2);
  const hours = parseInt(h, 10);
  return `${hours}:${p2(m)}:${p2(s)}.${cs}`;
};

// --- Parsers ---

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

    items.push({
      id: items.length + 1,
      startTime: normalizeTimestamp(start),
      endTime: normalizeTimestamp(end),
      original: original,
      translated: translated
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

      items.push({
        id: items.length + 1,
        startTime: normalizeTimestamp(parts[startIdx]),
        endTime: normalizeTimestamp(parts[endIdx]),
        original: clean(original),
        translated: clean(translated)
      });
    }
  });
  return items;
};

// --- File & Base64 Utils ---

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// --- Subtitle Generation Utils ---

export const generateSrtContent = (subtitles: SubtitleItem[], bilingual: boolean = true): string => {
  return subtitles
    .map((sub, index) => {
      // If bilingual is true, show original then translated. If false, only translated.
      const text = bilingual ? `${sub.original}\n${sub.translated}` : sub.translated;
      return `${index + 1}
${sub.startTime} --> ${sub.endTime}
${text}
`;
    })
    .join('\n');
};

export const generateAssContent = (subtitles: SubtitleItem[], title: string, bilingual: boolean = true): string => {
  // Updated Styles: 
  // Default: Fontsize 75 (Large), White (Primary) -> Used for Translation
  // Secondary: Fontsize 48 (Small), Yellow (Original) -> Used for Original Text

  const header = `[Script Info]
; Script generated by Gemini Subtitle Pro
Title: ${title}
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.601
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,75,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1
Style: Secondary,Arial,48,&H0000FFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = subtitles
    .map((sub) => {
      const start = toAssTime(sub.startTime);
      const end = toAssTime(sub.endTime);
      const originalText = sub.original || "";
      const translatedText = sub.translated || "";

      const cleanOriginal = originalText.replace(/\n/g, '\\N').replace(/\r/g, '');
      const cleanTranslated = translatedText.replace(/\n/g, '\\N').replace(/\r/g, '');

      let text = "";
      if (bilingual) {
        // Layout: Original (Small/Secondary) on TOP. Translated (Large/Default) on BOTTOM.
        // \rSecondary sets style to Secondary. \r resets to Default.
        text = `{\\rSecondary}${cleanOriginal}\\N{\\r}${cleanTranslated}`;
      } else {
        // Just translated text using Default style (large)
        text = cleanTranslated;
      }

      return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
    })
    .join('\n');

  return header + events;
};

export const downloadFile = (filename: string, content: string, format: OutputFormat) => {
  const windowsContent = content.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  const bom = '\uFEFF';
  const blob = new Blob([bom + windowsContent], {
    type: 'text/plain;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const parseGeminiResponse = (jsonResponse: string | null | undefined, maxDuration?: number): SubtitleItem[] => {
  if (!jsonResponse) return [];
  try {
    const cleanJson = jsonResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    let jsonToParse = cleanJson;
    const firstBracket = cleanJson.indexOf('[');
    const lastBracket = cleanJson.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      jsonToParse = cleanJson.substring(firstBracket, lastBracket + 1);
    }

    let items: GeminiSubtitleSchema[] = [];
    let parsed: any;
    try {
      parsed = JSON.parse(jsonToParse);
    } catch (e) {
      const match = cleanJson.match(/\[.*\]/s);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        throw e;
      }
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
        translated: item.text_translated || ""
      };
    }).filter(item => item !== null) as SubtitleItem[];

  } catch (e) {
    console.error("Failed to parse JSON from Gemini", e);
    return [];
  }
};

// --- Audio Extraction & Manipulation Utils ---

export const decodeAudio = async (file: File): Promise<AudioBuffer> => {
  const arrayBuffer = await file.arrayBuffer();
  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContext) throw new Error("Web Audio API not supported");
  const ctx = new AudioContext();
  return await ctx.decodeAudioData(arrayBuffer);
};

export const sliceAudioBuffer = async (originalBuffer: AudioBuffer, start: number, end: number): Promise<Blob> => {
  const duration = originalBuffer.duration;
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(duration, end);
  const length = safeEnd - safeStart;

  if (length <= 0) throw new Error("Invalid slice duration");

  // 16kHz mono is standard for Whisper
  const targetRate = 16000;
  const offlineCtx = new OfflineAudioContext(1, length * targetRate, targetRate);

  const source = offlineCtx.createBufferSource();
  source.buffer = originalBuffer;
  source.connect(offlineCtx.destination);

  // Start playing the original buffer at the negative offset of our start time
  // This effectively shifts the audio so that 'start' becomes 0 in the offline context
  source.start(0, safeStart, length);

  const resampled = await offlineCtx.startRendering();
  return audioBufferToWav(resampled);
};

export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataByteCount = buffer.length * blockAlign;
  const bufferLength = 44 + dataByteCount;

  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataByteCount, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataByteCount, true);

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = buffer.getChannelData(channel)[i];
      const s = Math.max(-1, Math.min(1, sample));
      const int16 = s < 0 ? s * 0x8000 : s * 0x7FFF;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

// --- OpenAI API (Whisper & GPT-4o Audio) ---

export const transcribeAudio = async (audioBlob: Blob, apiKey: string, model: string = 'whisper-1'): Promise<SubtitleItem[]> => {
  if (model.includes('gpt-4o')) {
    return transcribeWithOpenAIChat(audioBlob, apiKey, model);
  } else {
    return transcribeWithWhisper(audioBlob, apiKey, model);
  }
};

const transcribeWithWhisper = async (audioBlob: Blob, apiKey: string, model: string): Promise<SubtitleItem[]> => {
  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.wav');
  formData.append('model', model); // usually 'whisper-1'
  formData.append('response_format', 'verbose_json');

  let attempt = 0;
  const maxRetries = 3;
  let lastError: any;

  while (attempt < maxRetries) {
    try {
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Whisper API Error (${response.status}): ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const segments = data.segments as OpenAIWhisperSegment[];
      if (!segments) return [];

      return segments.map((seg, idx) => ({
        id: idx + 1,
        startTime: formatTime(seg.start),
        endTime: formatTime(seg.end),
        original: seg.text.trim(),
        translated: '' // Filled later by Gemini
      }));
    } catch (e: any) {
      console.warn(`Whisper attempt ${attempt + 1} failed:`, e);
      lastError = e;
      attempt++;
      if (attempt < maxRetries) await new Promise(res => setTimeout(res, 1000 * Math.pow(2, attempt - 1)));
    }
  }

  throw lastError || new Error("Failed to connect to Whisper API.");
};

const transcribeWithOpenAIChat = async (audioBlob: Blob, apiKey: string, model: string): Promise<SubtitleItem[]> => {
  const base64Audio = await blobToBase64(audioBlob);

  const requestBody = {
    model: model, // e.g., 'gpt-4o-audio-preview'
    modalities: ["text"],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Transcribe the following audio. Return ONLY a JSON object with a 'segments' array. Each segment must have 'start' (number, seconds), 'end' (number, seconds), and 'text' (string). Do not include any other markdown."
          },
          {
            type: "input_audio",
            input_audio: {
              data: base64Audio,
              format: "wav"
            }
          }
        ]
      }
    ]
  };

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`GPT-4o Transcription Error: ${err.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    // Parse the JSON from the text response
    let segments: any[] = [];
    try {
      const cleanJson = content.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      segments = parsed.segments || parsed.items || parsed;
    } catch (e) {
      console.warn("Failed to parse GPT-4o JSON response", content);
      // Fallback simple line parsing could go here, but avoiding for brevity
    }

    if (!Array.isArray(segments)) return [];

    return segments.map((seg, idx) => ({
      id: idx + 1,
      startTime: formatTime(parseFloat(seg.start)),
      endTime: formatTime(parseFloat(seg.end)),
      original: seg.text ? seg.text.trim() : "",
      translated: ""
    }));

  } catch (e: any) {
    throw new Error(`GPT-4o Audio Transcription failed: ${e.message}`);
  }
};
