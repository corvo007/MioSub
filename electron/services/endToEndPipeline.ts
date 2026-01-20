/**
 * End-to-End Pipeline Service
 * 端到端自动化流程编排服务
 *
 * 采用混合架构：
 * - 主进程负责：下载、音频提取、视频压制
 * - 渲染进程负责：字幕生成（使用现有逻辑）
 * - 通过 IPC 事件协调两个进程
 */

import { type BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import { ytDlpService, classifyError } from './ytdlp.ts';
import { extractAudioFromVideo } from './ffmpegAudioExtractor.ts';
import { VideoCompressorService } from './videoCompressor.ts';
import { analyticsService } from './analyticsService.ts';
import { t } from '../i18n.ts';
import type {
  EndToEndConfig,
  PipelineProgress,
  PipelineResult,
  PipelineStage,
  StageOutput,
} from '@/types/endToEnd';

// Re-export stage weights for use in progress calculation
const STAGE_WEIGHTS_LOCAL: Record<PipelineStage, number> = {
  idle: 0,
  downloading: 15,
  extracting_audio: 5,
  transcribing: 25,
  extracting_glossary: 10,
  extracting_speakers: 5,
  refining: 15,
  translating: 15,
  exporting_subtitle: 2,
  compressing: 8,
  completed: 0,
  failed: 0,
};

/**
 * 计算总体进度
 */
function calculateOverallProgress(
  currentStage: PipelineStage,
  stageProgress: number,
  enableCompression: boolean
): number {
  const stages: PipelineStage[] = [
    'downloading',
    'extracting_audio',
    'transcribing',
    'extracting_glossary',
    'extracting_speakers',
    'refining',
    'translating',
    'exporting_subtitle',
  ];

  if (enableCompression) {
    stages.push('compressing');
  }

  // Calculate total weight
  const totalWeight = stages.reduce((sum, s) => sum + STAGE_WEIGHTS_LOCAL[s], 0);

  // Calculate completed weight
  const currentIndex = stages.indexOf(currentStage);
  if (currentIndex === -1) {
    return currentStage === 'completed' ? 100 : 0;
  }

  let completedWeight = 0;
  for (let i = 0; i < currentIndex; i++) {
    completedWeight += STAGE_WEIGHTS_LOCAL[stages[i]];
  }

  // Add current stage partial progress
  const currentWeight = STAGE_WEIGHTS_LOCAL[currentStage] * (stageProgress / 100);

  return Math.round(((completedWeight + currentWeight) / totalWeight) * 100);
}

export class EndToEndPipeline {
  private isAborted: boolean = false;
  private mainWindow: BrowserWindow | null = null;
  private videoCompressor: VideoCompressorService;

  // Current execution state
  private currentStage: PipelineStage = 'idle';
  private outputs: StageOutput = {};
  private config: EndToEndConfig | null = null;
  private startTime: number = 0;

  constructor() {
    this.videoCompressor = new VideoCompressorService();
  }

  /**
   * 设置主窗口引用（用于 IPC 通信）
   */
  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }

  /**
   * 执行端到端流程
   */
  async execute(
    config: EndToEndConfig,
    onProgress: (progress: PipelineProgress) => void
  ): Promise<PipelineResult> {
    this.isAborted = false;
    this.config = config;
    this.startTime = Date.now();
    this.outputs = {};

    const updateProgress = (stage: PipelineStage, stageProgress: number, message: string) => {
      this.currentStage = stage;
      const progress: PipelineProgress = {
        stage,
        stageProgress,
        overallProgress: calculateOverallProgress(stage, stageProgress, config.enableCompression),
        message,
        stageStartTime: Date.now(),
        pipelineStartTime: this.startTime,
      };
      onProgress(progress);
    };

    try {
      // ========================================
      // Stage 1: 下载视频
      // ========================================
      updateProgress('downloading', 0, t('endToEnd.preparingDownload'));

      if (this.isAborted) throw new Error(t('endToEnd.userCancelled'));

      // Use passed videoInfo or parse URL if not provided
      let videoInfo = config.videoInfo;
      if (!videoInfo) {
        updateProgress('downloading', 0, t('endToEnd.parsingUrl'));
        videoInfo = await ytDlpService.parseUrl(config.url);
      }
      console.log(`[DEBUG] [Pipeline] Video info: ${videoInfo.title}`);

      // Analytics: Download Parsed
      void analyticsService.track(
        'download_parsed',
        {
          platform: videoInfo.platform,
          title: videoInfo.title,
          duration_sec: videoInfo.duration,
        },
        'interaction'
      );

      // Notify progress with video info
      onProgress({
        stage: 'downloading',
        stageProgress: 10,
        overallProgress: calculateOverallProgress('downloading', 10, config.enableCompression),
        message: t('endToEnd.downloading', { title: videoInfo.title }),
        videoInfo,
        pipelineStartTime: this.startTime,
      });

      if (this.isAborted) throw new Error(t('endToEnd.userCancelled'));

      // Create output directory with video title
      const safeTitle = videoInfo.title.replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);
      const outputDir = path.join(config.outputDir, safeTitle);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Select format based on config
      const formatId = config.downloadFormat || 'best';

      // Download video
      const videoPath = await ytDlpService.download(config.url, formatId, outputDir, (progress) => {
        onProgress({
          stage: 'downloading',
          stageProgress: 10 + progress.percent * 0.9,
          overallProgress: calculateOverallProgress(
            'downloading',
            10 + progress.percent * 0.9,
            config.enableCompression
          ),
          message: t('endToEnd.downloadingProgress', {
            percent: progress.percent.toFixed(1),
            speed: progress.speed,
          }),
          downloadProgress: progress,
          videoInfo,
          pipelineStartTime: this.startTime,
        });
      });

      this.outputs.videoPath = videoPath;
      console.log(`[DEBUG] [Pipeline] Video downloaded: ${videoPath}`);

      // Download thumbnail if enabled
      if (config.downloadThumbnail && videoInfo.thumbnail) {
        try {
          const thumbnailPath = await ytDlpService.downloadThumbnail(
            videoInfo.thumbnail,
            outputDir,
            videoInfo.title,
            videoInfo.id
          );
          this.outputs.thumbnailPath = thumbnailPath;
          console.log(`[DEBUG] [Pipeline] Thumbnail downloaded: ${thumbnailPath}`);
        } catch (err) {
          console.warn('[Pipeline] Thumbnail download failed:', err);
          // Non-fatal error, continue
        }
      }

      if (this.isAborted) throw new Error(t('endToEnd.userCancelled'));

      // ========================================
      // Stage 2: 提取音频
      // ========================================
      updateProgress('extracting_audio', 0, t('endToEnd.extractingAudio'));

      const audioPath = await extractAudioFromVideo(
        videoPath,
        {
          format: 'wav',
          sampleRate: 16000,
          channels: 1,
        },
        (progress) => {
          onProgress({
            stage: 'extracting_audio',
            stageProgress: progress.percent,
            overallProgress: calculateOverallProgress(
              'extracting_audio',
              progress.percent,
              config.enableCompression
            ),
            message: t('endToEnd.extractingAudioProgress', {
              percent: progress.percent.toFixed(1),
            }),
            pipelineStartTime: this.startTime,
          });
        }
      );

      this.outputs.audioPath = audioPath;
      console.log(`[DEBUG] [Pipeline] Audio extracted: ${audioPath}`);

      if (this.isAborted) throw new Error(t('endToEnd.userCancelled'));

      // ========================================
      // Stage 3-7: 字幕生成（由渲染进程处理）
      // ========================================
      // 通过 IPC 事件通知渲染进程开始字幕生成
      // 渲染进程完成后会通过 IPC 回调通知主进程

      updateProgress('transcribing', 0, t('endToEnd.preparingSubtitle'));

      // Send subtitle generation request to renderer
      if (!this.mainWindow) {
        throw new Error(t('endToEnd.mainWindowNotInit'));
      }

      // Track chunk progress
      const chunkProgress: Map<string | number, any> = new Map();

      // We'll use a promise-based approach to wait for renderer response
      const subtitleResult = await this.requestSubtitleGeneration(
        config,
        videoPath,
        audioPath,
        (chunkStatus) => {
          // Update chunk progress map
          chunkProgress.set(chunkStatus.id, chunkStatus);

          // Calculate Prep Progress (10%)
          // Include basic steps + optional steps based on config
          const prepSteps = ['decoding', 'segmenting'];
          if (config.enableGlossary) prepSteps.push('glossary');
          if (config.enableDiarization) prepSteps.push('diarization');

          let completedPrep = 0;
          for (const step of prepSteps) {
            const s = chunkProgress.get(step);
            if (s && s.status === 'completed') {
              completedPrep++;
            }
          }
          const prepProgress = (completedPrep / prepSteps.length) * 10;

          // Calculate Content Progress (90%)
          const chunks = Array.from(chunkProgress.values());
          const contentChunks = chunks.filter(
            (c) => !['decoding', 'segmenting', 'glossary', 'diarization'].includes(String(c.id))
          );

          let contentProgress = 0;
          let completed = 0;
          let total = 0;

          if (contentChunks.length > 0) {
            completed = contentChunks.filter((c) => c.status === 'completed').length;
            const firstWithTotal = contentChunks.find((c) => c.total);
            // Fallback to current length if total not found (though usually first chunk has it)
            total = firstWithTotal ? firstWithTotal.total : Math.max(contentChunks.length, 1);
            contentProgress = (completed / total) * 90;
          }

          const stageProgress = Math.min(prepProgress + contentProgress, 100);

          // Send progress update with chunk details
          onProgress({
            stage: 'transcribing',
            stageProgress,
            overallProgress: calculateOverallProgress(
              'transcribing',
              stageProgress,
              config.enableCompression
            ),
            message:
              total > 0
                ? t('endToEnd.generatingSubtitle', { completed, total })
                : t('endToEnd.generatingSubtitleSimple'),
            transcribeProgress: chunks,
            pipelineStartTime: this.startTime,
          });
        }
      );

      if (!subtitleResult.success) {
        throw new Error(subtitleResult.error || t('endToEnd.subtitleFailed'));
      }

      this.outputs.subtitles = subtitleResult.subtitles;

      // Save subtitle file if content is returned
      if (subtitleResult.subtitleContent) {
        const ext = subtitleResult.subtitleFormat || 'ass';
        const videoName = path.basename(videoPath, path.extname(videoPath));
        const subtitlePath = path.join(outputDir, `${videoName}.${ext}`);
        fs.writeFileSync(subtitlePath, subtitleResult.subtitleContent);
        this.outputs.subtitlePath = subtitlePath;
        console.log(`[DEBUG] [Pipeline] Subtitle file saved: ${subtitlePath}`);
      } else {
        this.outputs.subtitlePath = subtitleResult.subtitlePath;
      }

      console.log(`[DEBUG] [Pipeline] Subtitles generated: ${this.outputs.subtitlePath}`);

      if (this.isAborted) throw new Error(t('endToEnd.userCancelled'));

      // ========================================
      // Stage 8: 视频压制（可选）
      // ========================================
      if (config.enableCompression && config.embedSubtitle && this.outputs.subtitlePath) {
        updateProgress('compressing', 0, t('endToEnd.compressingVideo'));

        const outputVideoName = `${safeTitle}_hardsubbed.mp4`;
        const outputVideoPath = path.join(outputDir, outputVideoName);

        await this.videoCompressor.compress(
          videoPath,
          outputVideoPath,
          {
            encoder: config.compressionEncoder || 'libx264',
            crf: config.compressionCrf || 23,
            subtitlePath: this.outputs.subtitlePath,
            hwAccel: config.useHardwareAccel ? 'auto' : 'off',
            width: (() => {
              const res = config.compressionResolution;
              if (!res || res === 'original') return undefined;
              if (res === 'custom') return config.compressionWidth;
              const presets: Record<string, number> = { '1080p': 1920, '720p': 1280, '480p': 854 };
              return presets[res];
            })(),
            height: (() => {
              const res = config.compressionResolution;
              if (!res || res === 'original') return undefined;
              if (res === 'custom') return config.compressionHeight;
              const presets: Record<string, number> = { '1080p': 1080, '720p': 720, '480p': 480 };
              return presets[res];
            })(),
          },
          (progress) => {
            onProgress({
              stage: 'compressing',
              stageProgress: progress.percent,
              overallProgress: calculateOverallProgress(
                'compressing',
                progress.percent,
                config.enableCompression
              ),
              message: t('endToEnd.compressingVideoProgress', {
                percent: progress.percent.toFixed(1),
              }),
              compressProgress: progress,
              pipelineStartTime: this.startTime,
            });
          }
        );

        this.outputs.outputVideoPath = outputVideoPath;
        console.log(`[DEBUG] [Pipeline] Video compressed: ${outputVideoPath}`);
      }

      // ========================================
      // Complete
      // ========================================
      updateProgress('completed', 100, t('endToEnd.completed'));

      return {
        success: true,
        finalStage: 'completed',
        outputs: this.outputs,
        duration: Date.now() - this.startTime,
      };
    } catch (error: any) {
      console.error('[Pipeline] Error:', error);

      const errorStage = this.currentStage;
      const errorMessage = error.message || t('error.unknownError');

      // Classify error for better UX
      let classifiedError;
      if (errorStage === 'downloading') {
        classifiedError = classifyError(errorMessage);
      }

      return {
        success: false,
        finalStage: errorStage,
        outputs: this.outputs, // 保留已有产出
        duration: Date.now() - this.startTime,
        error: errorMessage,
        errorDetails: {
          stage: errorStage,
          message: classifiedError?.message || errorMessage,
          originalError: error.stack,
          retryable: classifiedError?.retryable || false,
        },
      };
    }
  }

  /**
   * 请求渲染进程执行字幕生成
   * 使用 IPC 事件进行通信
   */
  private async requestSubtitleGeneration(
    config: EndToEndConfig,
    videoPath: string,
    audioPath: string,
    onChunkProgress?: (chunkStatus: any) => void
  ): Promise<{
    success: boolean;
    subtitles?: any[];
    subtitlePath?: string;
    subtitleContent?: string;
    subtitleFormat?: string;
    error?: string;
  }> {
    return new Promise((resolve, reject) => {
      if (!this.mainWindow) {
        reject(new Error(t('endToEnd.mainWindowNotInit')));
        return;
      }

      // Set up response handler
      const responseChannel = 'end-to-end:subtitle-complete';
      const progressChannel = 'end-to-end:subtitle-progress';

      // Chunk progress handler
      const progressHandler = (_event: Electron.IpcMainEvent, chunkStatus: any) => {
        if (onChunkProgress) {
          onChunkProgress(chunkStatus);
        }
      };

      const responseHandler = (
        _event: Electron.IpcMainEvent,
        result: {
          success: boolean;
          subtitles?: any[];
          subtitlePath?: string;
          subtitleContent?: string;
          subtitleFormat?: string;
          error?: string;
        }
      ) => {
        // Remove listeners after response
        ipcMain.removeListener(responseChannel, responseHandler);
        ipcMain.removeListener(progressChannel, progressHandler);
        resolve(result);
      };

      ipcMain.on(progressChannel, progressHandler);
      ipcMain.on(responseChannel, responseHandler);

      // Send request to renderer
      this.mainWindow.webContents.send('end-to-end:generate-subtitles', {
        config,
        videoPath,
        audioPath,
      });
    });
  }

  /**
   * 中止当前执行
   */
  abort(): void {
    console.log('[DEBUG] [Pipeline] Aborting...');
    this.isAborted = true;

    // Abort sub-services
    ytDlpService.abort();
    this.videoCompressor.cancel();

    // Signal renderer to abort subtitle generation
    if (this.mainWindow) {
      this.mainWindow.webContents.send('end-to-end:abort-subtitle-generation');
    }
  }

  /**
   * 获取当前状态
   */
  getStatus(): {
    stage: PipelineStage;
    outputs: StageOutput;
    isRunning: boolean;
  } {
    return {
      stage: this.currentStage,
      outputs: this.outputs,
      isRunning:
        this.currentStage !== 'idle' &&
        this.currentStage !== 'completed' &&
        this.currentStage !== 'failed',
    };
  }
}

// Export singleton instance
export const endToEndPipeline = new EndToEndPipeline();
