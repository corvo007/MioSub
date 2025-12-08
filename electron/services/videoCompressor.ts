import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import ffprobePath from '@ffprobe-installer/ffprobe';
import path from 'path';
import fs from 'fs';

const fixPathForAsar = (pathStr: string) => {
  return pathStr.replace('app.asar', 'app.asar.unpacked');
};

// Set FFmpeg paths with null checks and logging
console.log('[VideoCompressor] Initializing FFmpeg paths...');
console.log('[VideoCompressor] ffmpegPath module:', ffmpegPath);
console.log('[VideoCompressor] ffprobePath module:', ffprobePath);

if (ffmpegPath?.path) {
  const fixedPath = fixPathForAsar(ffmpegPath.path);
  console.log('[VideoCompressor] Setting FFmpeg path:', fixedPath);
  ffmpeg.setFfmpegPath(fixedPath);
} else {
  console.error('[VideoCompressor] ERROR: ffmpegPath.path is undefined!');
}

if (ffprobePath?.path) {
  const fixedPath = fixPathForAsar(ffprobePath.path);
  console.log('[VideoCompressor] Setting FFprobe path:', fixedPath);
  ffmpeg.setFfprobePath(fixedPath);
} else {
  console.error('[VideoCompressor] ERROR: ffprobePath.path is undefined!');
}

export interface VideoMetadata {
  duration?: number;
  size?: number;
  width?: number;
  height?: number;
  codec?: string;
}

export interface CompressionOptions {
  encoder: 'libx264' | 'libx265';
  crf: number;
  width?: number;
  height?: number;
  subtitlePath?: string;
}

export interface CompressionProgress {
  percent: number;
  currentFps: number;
  currentKbps: number;
  targetSize: number;
  timemark: string;
}

export class VideoCompressorService {
  // Store active compression command for cancellation
  private activeCommand: ReturnType<typeof ffmpeg> | null = null;
  async compress(
    inputPath: string,
    outputPath: string,
    options: CompressionOptions,
    onProgress?: (progress: CompressionProgress) => void,
    onLog?: (message: string) => void
  ): Promise<string> {
    const log = (msg: string) => onLog && onLog(msg);

    log(`[Compression] Starting compression: ${inputPath}`);
    log(`[Compression] Output: ${outputPath}`);
    log(`[Compression] Encoder: ${options.encoder}, CRF: ${options.crf}`);
    if (options.width && options.width > 0) {
      log(`[Compression] Resolution: ${options.width}x${options.height || '?'}`);
    }
    if (options.subtitlePath) {
      log(`[Compression] Subtitle: ${options.subtitlePath}`);
    }

    return new Promise((resolve, reject) => {
      // Validate input file exists
      if (!fs.existsSync(inputPath)) {
        const errMsg = `Input file does not exist: ${inputPath}`;
        log(`[ERROR] [Compression] ${errMsg}`);
        reject(new Error(errMsg));
        return;
      }
      log(`[Compression] Input file verified: ${inputPath}`);

      let command = ffmpeg(inputPath)
        .output(outputPath)
        .videoCodec(options.encoder)
        .addOutputOption(`-crf ${options.crf}`)
        .addOutputOption('-preset medium')
        // Enable verbose logging
        .addInputOption('-v', 'verbose');

      // Add advanced x264 params to match Maruko Toolbox (小丸工具箱)
      if (options.encoder === 'libx264') {
        // Log: --crf 23.5 --preset 8 -I 300 -r 4 -b 3 --me umh -i 1 --scenecut 60 -f 1:1 --qcomp 0.5 --psy-rd 0.3:0 --aq-mode 2 --aq-strength 0.8
        // Additional from x264 info: subme=10, merange=24, trellis=2, direct=auto, b_adapt=2, rc_lookahead=60
        command.addOutputOption(
          '-x264-params',
          'keyint=300:min-keyint=1:ref=4:bframes=3:b-adapt=2:me=umh:merange=24:subme=10:trellis=2:direct=auto:scenecut=60:qcomp=0.5:psy-rd=0.3:0:aq-mode=2:aq-strength=0.8:deblock=1:1:rc-lookahead=60'
        );
      }

      if (options.width && options.width > 0) {
        const h = options.height && options.height > 0 ? options.height : '?';
        command = command.size(`${options.width}x${h}`);
        command.addOutputOption('-sws_flags', 'lanczos'); // Use Lanczos scaler
      }

      // Subtitle Hardsub
      if (options.subtitlePath) {
        // Escape path for FFmpeg filter:
        // Windows path separators '\' need to be escaped as '\\' or '/'
        // Colons ':' need to be escaped as '\:'
        const escapedPath = options.subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:');
        log(`[Compression] Subtitle path escaped: ${escapedPath}`);
        command.videoFilters(`subtitles='${escapedPath}'`);
      }

      // Store command reference for potential cancellation
      this.activeCommand = command;

      command
        .on('start', (cmdLine) => {
          log(`[DEBUG] [FFmpeg] Full command: ${cmdLine}`);
          console.log('[FFmpeg] Command:', cmdLine);
        })
        .on('progress', (p) => {
          if (onProgress)
            onProgress({
              percent: p.percent,
              currentFps: p.currentFps,
              currentKbps: p.currentKbps,
              targetSize: p.targetSize,
              timemark: p.timemark,
            });
        })
        .on('stderr', (stderrLine) => {
          // Log ALL FFmpeg stderr for debugging
          console.log('[FFmpeg stderr]', stderrLine);
          log(`[FFmpeg] ${stderrLine}`);
        })
        .on('end', () => {
          this.activeCommand = null;
          log(`[Compression] Completed: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (err, stdout, stderr) => {
          this.activeCommand = null;
          log(`[ERROR] [Compression] Failed: ${err.message}`);
          console.error('[FFmpeg] Error:', err.message);
          console.error('[FFmpeg] stderr:', stderr);
          log(`[ERROR] [FFmpeg stderr]: ${stderr}`);
          reject(err);
        })
        .run();
    });
  }

  /**
   * Cancel the current compression if any
   */
  cancel(): boolean {
    if (this.activeCommand) {
      try {
        (this.activeCommand as any).kill('SIGTERM');
        this.activeCommand = null;
        return true;
      } catch (e) {
        console.error('[Compression] Failed to cancel:', e);
        return false;
      }
    }
    return false;
  }

  async probe(filePath: string): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) return reject(err);
        const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
        resolve({
          duration: metadata.format.duration,
          size: metadata.format.size,
          width: videoStream?.width,
          height: videoStream?.height,
          codec: videoStream?.codec_name,
        });
      });
    });
  }
}
