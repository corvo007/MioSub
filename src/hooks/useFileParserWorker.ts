import { useRef, useCallback } from 'react';
import FileParserWorker from '@/workers/fileParser.worker?worker';
import { type SubtitleItem } from '@/types/subtitle';

export const useFileParserWorker = () => {
  const workerRef = useRef<Worker | null>(null);

  const initWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new FileParserWorker();
    }
    return workerRef.current;
  }, []);

  const parseSubtitle = useCallback(
    (content: string, fileType: 'srt' | 'ass'): Promise<SubtitleItem[]> => {
      return new Promise((resolve, reject) => {
        const worker = initWorker();

        const cleanup = () => {
          worker.removeEventListener('message', handleMessage);
          worker.removeEventListener('error', handleError);
          worker.removeEventListener('messageerror', handleMessageError);
        };

        const handleMessage = (e: MessageEvent) => {
          if (e.data.type === 'success') {
            cleanup();
            resolve(e.data.data);
          } else if (e.data.type === 'error') {
            cleanup();
            reject(new Error(e.data.error));
          }
        };

        const handleError = (e: ErrorEvent) => {
          cleanup();
          reject(new Error(`Worker error: ${e.message || 'Unknown worker error'}`));
        };

        const handleMessageError = (e: MessageEvent) => {
          cleanup();
          reject(new Error('Worker message deserialization failed'));
        };

        worker.addEventListener('message', handleMessage);
        worker.addEventListener('error', handleError);
        worker.addEventListener('messageerror', handleMessageError);

        worker.postMessage({
          command: fileType === 'srt' ? 'PARSE_SRT' : 'PARSE_ASS',
          content,
        });
      });
    },
    [initWorker]
  );

  const cleanup = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  return { parseSubtitle, cleanup };
};
