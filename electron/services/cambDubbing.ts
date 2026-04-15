/**
 * Camb AI Dubbing service (main process).
 *
 * Wraps @camb-ai/sdk's end-to-end dubbing API. This requires a **public video URL**
 * (not a local file path) — the Camb dub endpoint does not accept uploads.
 *
 * Verified SDK shape (2026-04, see integrations/CAMB_API_NOTES.md):
 *   - new CambClient({ apiKey })
 *   - client.languages.getSourceLanguages() / getTargetLanguages()
 *   - client.dub.endToEndDubbing({ video_url, source_language, target_language }) -> { task_id }
 *   - client.dub.getEndToEndDubbingStatus({ task_id }) -> { status, run_id, ... }
 *   - client.dub.getDubbedRunInfo({ run_id }) -> { ..., video_url / output_url }
 */

import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { mainLogger } from '../logger.ts';

export interface DubOptions {
  /**
   * Publicly accessible HTTP(S) URL of the source video.
   * Local filesystem paths are NOT supported by Camb's dub API.
   */
  videoUrl: string;
  apiKey: string;
  sourceLanguage: string; // e.g. "en"
  targetLanguage: string; // e.g. "es"
  outputDir?: string;
}

export interface DubResult {
  success: boolean;
  outputPath?: string;
  taskId?: string;
  runId?: string;
  error?: string;
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

export async function runCambDub(opts: DubOptions): Promise<DubResult> {
  const { videoUrl, apiKey, sourceLanguage, targetLanguage } = opts;

  if (!apiKey) return { success: false, error: 'CAMB_API_KEY missing' };
  if (!videoUrl) return { success: false, error: 'videoUrl is required' };

  // Reject local paths - Camb's dub API only accepts public URLs.
  if (!/^https?:\/\//i.test(videoUrl)) {
    // Give a clear error if the caller mistakenly handed us a local file path.
    if (videoUrl.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(videoUrl) || fs.existsSync(videoUrl)) {
      return {
        success: false,
        error: `Camb dub requires a public HTTP(S) URL for video_url; got local path "${videoUrl}". Upload the file to a public URL first.`,
      };
    }
    return { success: false, error: `videoUrl must be an http(s) URL, got "${videoUrl}"` };
  }

  let sdk: any;
  try {
    sdk = await import('@camb-ai/sdk');
  } catch (e: any) {
    return { success: false, error: `Camb SDK not installed: ${e.message}` };
  }

  const CambClient = sdk.CambClient ?? sdk.default?.CambClient;
  if (!CambClient) {
    return { success: false, error: 'Could not resolve CambClient export from @camb-ai/sdk' };
  }

  const client = new CambClient({ apiKey });

  try {
    mainLogger.log('INFO', '[CambDub] Resolving language ids', { sourceLanguage, targetLanguage });

    const [srcLangs, tgtLangs]: [CambLanguage[], CambLanguage[]] = await Promise.all([
      client.languages.getSourceLanguages(),
      client.languages.getTargetLanguages(),
    ]);

    const source_language = resolveLangId(srcLangs, sourceLanguage);
    const target_language = resolveLangId(tgtLangs, targetLanguage);
    if (source_language == null) {
      return { success: false, error: `Camb: source language "${sourceLanguage}" not supported` };
    }
    if (target_language == null) {
      return { success: false, error: `Camb: target language "${targetLanguage}" not supported` };
    }

    mainLogger.log('INFO', '[CambDub] Starting end-to-end dub', { videoUrl, source_language, target_language });
    const created: any = await client.dub.endToEndDubbing({
      video_url: videoUrl,
      source_language,
      target_language,
    });

    const taskId: string | undefined = created?.task_id;
    if (!taskId) {
      return { success: false, error: `Camb: endToEndDubbing returned no task_id (got ${JSON.stringify(created)})` };
    }

    // Poll (dubbing can take several minutes). Cap at ~30 min.
    let runId: string | undefined;
    const deadline = Date.now() + 30 * 60_000;
    while (Date.now() < deadline) {
      await sleep(10_000);
      const status: any = await client.dub.getEndToEndDubbingStatus({ task_id: taskId });
      if (status?.status === 'SUCCESS') {
        runId = status.run_id;
        break;
      }
      if (status?.status === 'ERROR' || status?.status === 'FAILED') {
        return {
          success: false,
          taskId,
          error: `Camb dub task failed: ${JSON.stringify(status?.exception_reason ?? status?.message ?? status)}`,
        };
      }
    }
    if (!runId) {
      return { success: false, taskId, error: 'Camb dub task timed out' };
    }

    const info: any = await client.dub.getDubbedRunInfo({ run_id: runId });
    const downloadUrl: string | undefined =
      info?.video_url ?? info?.output_url ?? info?.url ?? info?.dubbed_video_url;

    if (!downloadUrl) {
      return { success: false, taskId, runId, error: `Camb dub: no output URL in run info (got ${JSON.stringify(info)})` };
    }

    const outputDir = opts.outputDir || path.join(app.getPath('temp'), 'miosub-dub');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const base = `camb-dub-${Date.now()}`;
    const outputPath = path.join(outputDir, `${base}.${targetLanguage}.mp4`);

    const res = await fetch(downloadUrl);
    if (!res.ok) {
      return { success: false, taskId, runId, error: `Download failed: ${res.status}` };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(outputPath, buf);

    mainLogger.log('INFO', '[CambDub] Dub complete', { outputPath });
    return { success: true, outputPath, taskId, runId };
  } catch (e: any) {
    mainLogger.log('ERROR', '[CambDub] Dub failed', { error: e?.message });
    return { success: false, error: e?.message || String(e) };
  }
}
