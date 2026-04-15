/**
 * Camb AI transcription provider.
 *
 * Uses the @camb-ai/sdk package (CambClient).
 *
 * Real SDK shape (verified 2026-04, see integrations/CAMB_API_NOTES.md):
 *   - client.languages.getSourceLanguages() -> [{ id, language, short_name }]
 *   - client.transcription.createTranscription({ media_file, language }) -> { task_id }
 *   - client.transcription.getTranscriptionTaskStatus({ task_id }) -> { status, run_id }
 *   - client.transcription.getTranscriptionResult({ run_id }) -> { transcript: [{start,end,text,speaker}] }
 *
 * `language` is a numeric ID resolved from a user-facing code (e.g. "en").
 */

import { type SubtitleItem } from '@/types/subtitle';
import { generateSubtitleId } from '@/services/utils/id';
import { formatTime } from '@/services/subtitle/time';
import { logger } from '@/services/utils/logger';
import { UserActionableError } from '@/services/utils/errors';
import i18n from '@/i18n';

interface CambTranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

interface CambLanguage {
  id: number;
  language?: string;
  short_name?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function resolveLangId(list: CambLanguage[], code: string): number | null {
  if (!code) return null;
  const low = code.toLowerCase();
  const base = low.split(/[-_]/)[0];
  const hit =
    list.find((l) => l.short_name?.toLowerCase() === low) ||
    list.find((l) => l.short_name?.toLowerCase() === base) ||
    list.find((l) => l.short_name?.toLowerCase().startsWith(base)) ||
    list.find((l) => l.language?.toLowerCase() === low) ||
    list.find((l) => l.language?.toLowerCase().startsWith(base));
  return hit?.id ?? null;
}

/**
 * Transcribe audio with Camb AI.
 */
export const transcribeWithCamb = async (
  audioBlob: Blob,
  apiKey: string,
  timeout?: number,
  signal?: AbortSignal,
  sourceLanguage: string = 'en'
): Promise<SubtitleItem[]> => {
  if (!apiKey) {
    throw new UserActionableError(i18n.t('services:api.errors.invalidKey'), 'INVALID_API_KEY');
  }

  if (signal?.aborted) {
    throw new Error(i18n.t('services:pipeline.errors.cancelled'));
  }

  logger.debug(`[Camb] Starting transcription, blob size: ${audioBlob.size}`);

  // Load SDK lazily so the web bundle doesn't hard-require Node-only deps.
  const mod: any = await import('@camb-ai/sdk');
  const CambClient = mod.CambClient ?? mod.default?.CambClient;
  if (!CambClient) {
    throw new Error('[Camb] Failed to resolve CambClient export from @camb-ai/sdk');
  }

  const client = new CambClient({ apiKey });

  const deadline = Date.now() + (timeout ?? 600000);
  const checkAbort = () => {
    if (signal?.aborted) throw new Error(i18n.t('services:pipeline.errors.cancelled'));
    if (Date.now() > deadline) throw new Error('[Camb] Transcription timed out');
  };

  // Resolve numeric language id
  const srcLangs: CambLanguage[] = await client.languages.getSourceLanguages();
  const language = resolveLangId(srcLangs, sourceLanguage);
  if (language == null) {
    throw new Error(`[Camb] Source language "${sourceLanguage}" not supported`);
  }

  // Wrap Blob as something the SDK can upload. Node form-data accepts File/Blob in recent versions.
  const mediaFile =
    typeof File !== 'undefined'
      ? new File([audioBlob], 'audio.wav', { type: audioBlob.type || 'audio/wav' })
      : audioBlob;

  let created: any;
  try {
    created = await client.transcription.createTranscription({
      media_file: mediaFile,
      language,
    });
  } catch (err: any) {
    if (err?.status === 401 || /unauthoriz|api.?key/i.test(err?.message || '')) {
      throw new UserActionableError(i18n.t('services:api.errors.invalidKey'), 'INVALID_API_KEY');
    }
    throw err;
  }

  const taskId = created?.task_id;
  if (!taskId) {
    throw new Error(`[Camb] createTranscription returned no task_id (got ${JSON.stringify(created)})`);
  }

  // Poll until SUCCESS / ERROR
  let runId: string | undefined;
  while (true) {
    checkAbort();
    const status: any = await client.transcription.getTranscriptionTaskStatus({ task_id: taskId });
    if (status?.status === 'SUCCESS') {
      runId = status.run_id;
      break;
    }
    if (status?.status === 'ERROR' || status?.status === 'FAILED') {
      throw new Error(
        `[Camb] Transcription task failed: ${JSON.stringify(status?.exception_reason ?? status?.message ?? status)}`
      );
    }
    await sleep(3000);
  }

  if (!runId) {
    throw new Error('[Camb] Transcription succeeded but no run_id returned');
  }

  const result: any = await client.transcription.getTranscriptionResult({ run_id: runId });
  const segments: CambTranscriptSegment[] = result?.transcript ?? [];

  return segments.map((seg) => ({
    id: generateSubtitleId(),
    startTime: formatTime(seg.start),
    endTime: formatTime(seg.end),
    original: (seg.text ?? '').trim(),
    translated: '',
    speaker: seg.speaker,
  }));
};
