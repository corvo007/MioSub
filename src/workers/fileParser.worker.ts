/// <reference lib="webworker" />
import { parseSrt, parseAss } from '@/services/subtitle/parser';

interface ParseMessage {
  command: 'PARSE_SRT' | 'PARSE_ASS';
  content: string;
}

interface ParseResult {
  type: 'success' | 'error';
  data?: any;
  error?: string;
}

self.onmessage = async (e: MessageEvent<ParseMessage>) => {
  const { command, content } = e.data;

  try {
    let result;

    if (command === 'PARSE_SRT') {
      result = parseSrt(content);
    } else if (command === 'PARSE_ASS') {
      result = parseAss(content);
    } else {
      throw new Error('Unknown command');
    }

    self.postMessage({ type: 'success', data: result } as ParseResult);
  } catch (error: any) {
    self.postMessage({
      type: 'error',
      error: error.message || String(error),
    } as ParseResult);
  }
};
