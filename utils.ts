import { SubtitleItem, OutputFormat, GeminiSubtitleSchema } from './types';

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
  
  let h=0, m=0, s=0, ms=0;
  
  if (parts.length === 3) {
    h = parseInt(parts[0], 10) || 0;
    m = parseInt(parts[1], 10) || 0;
    const s_parts = parts[2].split(',');
    s = parseInt(s_parts[0], 10) || 0;
    ms = parseInt((s_parts[1] || '0').padEnd(3,'0').slice(0,3), 10) || 0;
  } else if (parts.length === 2) {
    m = parseInt(parts[0], 10) || 0;
    const s_parts = parts[1].split(',');
    s = parseInt(s_parts[0], 10) || 0;
    ms = parseInt((s_parts[1] || '0').padEnd(3,'0').slice(0,3), 10) || 0;
  }
  
  return h * 3600 + m * 60 + s + (ms / 1000);
};

/**
 * Normalizes timestamp to strictly HH:MM:SS,mmm format for SRT/PotPlayer compatibility.
 * Handles inputs like "00:12", "1:05.500", "12.3", "1:00".
 * Also mathematically fixes overflows (e.g. 69 seconds -> 1 minute 9 seconds).
 * 
 * @param maxDuration (Optional) Video duration in seconds. Used for heuristic correction.
 */
export const normalizeTimestamp = (timeStr: string, maxDuration?: number): string => {
  if (!timeStr) return '00:00:00,000';

  // Remove any non-digit/colon/dot/comma characters
  const cleanStr = timeStr.replace(/[^0-9:.,]/g, '').replace('.', ',');
  
  let parts = cleanStr.split(':');
  
  // Robust parsing logic to handle various depths (SS, MM:SS, HH:MM:SS)
  let secondsPart = parts.pop() || '0';
  let minutesPart = parts.pop() || '0';
  let hoursPart = parts.pop() || '0';

  // Handle milliseconds
  let [secsStr, msStr] = secondsPart.split(',');
  if (!msStr) msStr = '000';
  
  // Parse as integers to allow overflow math (e.g. AI outputting "69 seconds")
  let h = parseInt(hoursPart, 10) || 0;
  let m = parseInt(minutesPart, 10) || 0;
  let s = parseInt(secsStr, 10) || 0;
  let ms = parseInt(msStr.padEnd(3, '0').slice(0, 3), 10) || 0; // Ensure max 3 digits for input ms

  // Normalize (Carry over seconds > 59 to minutes, etc.)
  m += Math.floor(s / 60);
  s = s % 60;
  h += Math.floor(m / 60);
  m = m % 60;

  // --- HEURISTIC FIX ---
  // If the parsed time significantly exceeds the video duration, 
  // it is likely the AI used HH:MM:SS to represent MM:SS:ms (Unit Shift).
  if (maxDuration && maxDuration > 0) {
    const totalSeconds = h * 3600 + m * 60 + s;
    
    // If we are way past the duration (plus a small buffer for credits/slight errors)
    if (totalSeconds > maxDuration + 30) {
      // Logic: The AI likely outputted "01:30:15" meaning "1 minute, 30 seconds, 15 frames/ms"
      // Instead of parsing as 1 hour, 30 mins...
      // We SHIFT units down: H -> M, M -> S, S -> MS.
      
      // We use the ORIGINAL parsed integers before normalization (mostly)
      // but using normalized h/m is safer for clean logic.
      if (h > 0) {
        // Shift H to M, M to S
        // Note: The 's' (original seconds) becomes milliseconds. 
        // We multiply by 10 just to be safe (e.g. 15 -> 150ms), usually AI writes 2 digits for frames.
        const newM = h;
        const newS = m;
        const newMs = s * 10; 
        
        return `${p2(0)}:${p2(newM)}:${p2(newS)},${p3(newMs)}`;
      }
    }
  }

  return `${p2(h)}:${p2(m)}:${p2(s)},${p3(ms)}`;
};

const p2 = (n: number) => n.toString().padStart(2, '0');
const p3 = (n: number) => n.toString().padStart(3, '0');

/**
 * Converts normalized HH:MM:SS,mmm to ASS format H:MM:SS.cc
 * Strictly formats to ensure PotPlayer compatibility.
 */
export const toAssTime = (normalizedTime: string): string => {
  // Input: 00:00:00,000
  const [hms, ms] = normalizedTime.split(',');
  const [h, m, s] = hms.split(':');
  
  // ASS uses centiseconds (2 digits)
  const cs = ms.slice(0, 2); 
  
  // Strict padding for minutes and seconds is crucial
  const p2 = (n: string) => n.padStart(2, '0').slice(-2);
  const hours = parseInt(h, 10); // Single digit hour is standard for ASS, unless > 9

  return `${hours}:${p2(m)}:${p2(s)}.${cs}`;
};

// --- File & Base64 Utils ---

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the Data-URL declaration (e.g., "data:video/mp4;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

// --- Subtitle Generation Utils ---

export const generateSrtContent = (subtitles: SubtitleItem[]): string => {
  return subtitles
    .map((sub, index) => {
      // Clean text for SRT (ensure no weird control chars, but keep newlines)
      const text = `${sub.original}\n${sub.translated}`;
      return `${index + 1}
${sub.startTime} --> ${sub.endTime}
${text}
`;
    })
    .join('\n'); // Will be normalized to \r\n in downloadFile
};

export const generateAssContent = (subtitles: SubtitleItem[], title: string): string => {
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
Style: Default,Arial,50,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1
Style: Secondary,Arial,40,&H0000FFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = subtitles
    .map((sub) => {
      const start = toAssTime(sub.startTime);
      const end = toAssTime(sub.endTime);
      
      // ASS Logic:
      // 1. Escape standard newlines (\n) to ASS newlines (\N)
      const cleanOriginal = sub.original.replace(/\n/g, '\\N').replace(/\r/g, '');
      const cleanTranslated = sub.translated.replace(/\n/g, '\\N').replace(/\r/g, '');
      
      // Use proper Style Group switching (\rSecondary) instead of inline overrides (\c&H...)
      // This defines the secondary style in the header and switches to it for the translation.
      const text = `${cleanOriginal}\\N{\\rSecondary}${cleanTranslated}`;
      
      return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
    })
    .join('\n');

  return header + events;
};

// --- Download Helper (The Fixer) ---

export const downloadFile = (filename: string, content: string, format: OutputFormat) => {
  // FIX 2: Force Windows-style line endings (\r\n)
  // This is critical for PotPlayer to read line breaks correctly
  const windowsContent = content.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');

  // FIX 1: Add Byte Order Mark (BOM) for UTF-8
  // This helps Windows players (PotPlayer) recognize Chinese characters correctly
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

export const parseGeminiResponse = (jsonResponse: string, maxDuration?: number): SubtitleItem[] => {
  try {
    // 1. Clean Markdown
    const cleanJson = jsonResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    
    // 2. Extract Array if wrapped in text (Robustness fix)
    let jsonToParse = cleanJson;
    const firstBracket = cleanJson.indexOf('[');
    const lastBracket = cleanJson.lastIndexOf(']');
    
    // Only substring if brackets exist and strictly look like an array wrapper
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
        jsonToParse = cleanJson.substring(firstBracket, lastBracket + 1);
    }

    const parsed: any = JSON.parse(jsonToParse);

    let items: GeminiSubtitleSchema[] = [];

    if (Array.isArray(parsed)) {
        items = parsed;
    } else if (parsed && parsed.subtitles && Array.isArray(parsed.subtitles)) {
        items = parsed.subtitles;
    } else if (parsed && parsed.items && Array.isArray(parsed.items)) {
         // Fallback for some schemas that wrap in "items"
        items = parsed.items;
    }

    // Filter out empty items where both original and translated text are empty or whitespace
    items = items.filter(item => {
      const original = item.text_original ? String(item.text_original).trim() : '';
      const translated = item.text_translated ? String(item.text_translated).trim() : '';
      return original.length > 0 || translated.length > 0;
    });

    return items.map((item, index) => {
      // 1. Normalize formatting
      let startStr = normalizeTimestamp(item.start, maxDuration);
      let endStr = normalizeTimestamp(item.end, maxDuration);

      // 2. Sanity Check & Correction
      let startSec = timeToSeconds(startStr);
      let endSec = timeToSeconds(endStr);

      // Check for swapped times
      if (startSec > endSec) {
        // Swap them back
        const tempSec = startSec;
        startSec = endSec;
        endSec = tempSec;
        
        // Re-format after swap
        startStr = formatTime(startSec);
        endStr = formatTime(endSec);
      }
      
      // Ensure Minimum Duration (0.5s)
      if (endSec - startSec < 0.5) {
          endSec = startSec + 1.5;
          endStr = formatTime(endSec);
      }

      // Check for excessive duration (e.g., > 10 seconds) which is likely an AI error
      if ((endSec - startSec) > 10) {
        // Clamp end time to start + 5 seconds (reasonable default)
        endSec = startSec + 5;
        endStr = formatTime(endSec);
      }
      
      return {
        id: index + 1,
        startTime: startStr,
        endTime: endStr,
        original: item.text_original,
        translated: item.text_translated
      };
    });

  } catch (e) {
    console.error("Failed to parse JSON from Gemini", e);
    // If text exists but not JSON, maybe log it or try a different strategy?
    // For now returning empty triggers the "AI returned no subtitles" error which is correct.
    return [];
  }
};