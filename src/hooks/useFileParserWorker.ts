import { useRef, useCallback } from 'react';
import FileParserWorker from '@/workers/fileParser.worker?worker';
import { SubtitleItem } from '@/types/subtitle';

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

        const handleMessage = (e: MessageEvent) => {
          if (e.data.type === 'success') {
            worker.removeEventListener('message', handleMessage);
            resolve(e.data.data);
          } else if (e.data.type === 'error') {
            worker.removeEventListener('message', handleMessage);
            reject(new Error(e.data.error));
          }
        };

        worker.addEventListener('message', handleMessage);
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
