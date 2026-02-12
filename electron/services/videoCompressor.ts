import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
import { getBinaryPath, getResourcesPath } from '../utils/paths.ts';

// GPU Encoder definitions with priority order
// Priority: NVIDIA (nvenc) > Intel (qsv) > AMD (amf) > CPU (lib*)
export type GpuEncoderType =
  | 'h264_nvenc'
  | 'hevc_nvenc'
  | 'h264_qsv'
  | 'hevc_qsv'
  | 'h264_amf'
  | 'hevc_amf';
export type CpuEncoderType = 'libx264' | 'libx265';
export type EncoderType = GpuEncoderType | CpuEncoderType;

// Mapping from codec to GPU encoders (in priority order) and CPU fallback
const ENCODER_MAP = {
  h264: {
    gpu: ['h264_nvenc', 'h264_qsv', 'h264_amf'] as GpuEncoderType[],
    cpu: 'libx264' as CpuEncoderType,
  },
  h265: {
    gpu: ['hevc_nvenc', 'hevc_qsv', 'hevc_amf'] as GpuEncoderType[],
    cpu: 'libx265' as CpuEncoderType,
  },
} as const;

export interface HardwareAccelInfo {
  available: boolean;
  encoders: {
    h264_nvenc: boolean;
    hevc_nvenc: boolean;
    h264_qsv: boolean;
    hevc_qsv: boolean;
    h264_amf: boolean;
    hevc_amf: boolean;
  };
  preferredH264: EncoderType;
  preferredH265: EncoderType;
}

// 获取正确的 FFmpeg/FFprobe 路径

// Set FFmpeg paths with null checks
// Set FFmpeg paths with null checks
const ffmpegPath = getBinaryPath('ffmpeg');
const ffprobePath = getBinaryPath('ffprobe');

if (fs.existsSync(ffmpegPath)) {
  ffmpeg.setFfmpegPath(ffmpegPath);
} else {
  console.error('[VideoCompressor] ERROR: ffmpeg.exe not found at:', ffmpegPath);
}

if (fs.existsSync(ffprobePath)) {
  ffmpeg.setFfprobePath(ffprobePath);
} else {
  console.error('[VideoCompressor] ERROR: ffprobe.exe not found at:', ffprobePath);
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
  hwAccel?: 'auto' | 'off'; // GPU hardware acceleration mode
  videoSource?: 'workspace' | 'external';
  subtitleSource?: 'workspace' | 'external' | 'none';
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
  private activeCommand: { command: ReturnType<typeof ffmpeg>; outputPath: string } | null = null;

  // Flag to track if compression was cancelled by user
  private isCancelled: boolean = false;

  // Cached hardware acceleration info
  private hwAccelInfo: HardwareAccelInfo | null = null;

  /**
   * Detect available GPU encoders by running ffmpeg -encoders
   * Results are cached for subsequent calls
   */
  async detectHardwareAccel(): Promise<HardwareAccelInfo> {
    if (this.hwAccelInfo) {
      return this.hwAccelInfo;
    }

    const encodersToCheck: (keyof HardwareAccelInfo['encoders'])[] = [
      'h264_nvenc',
      'hevc_nvenc', // NVIDIA
      'h264_qsv',
      'hevc_qsv', // Intel
      'h264_amf',
      'hevc_amf', // AMD
    ];

    const encoderStatus: HardwareAccelInfo['encoders'] = {
      h264_nvenc: false,
      hevc_nvenc: false,
      h264_qsv: false,
      hevc_qsv: false,
      h264_amf: false,
      hevc_amf: false,
    };

    try {
      // Get the FFmpeg binary path (already correctly set based on environment)
      const ffmpegBinary = ffmpegPath || 'ffmpeg';
      const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';

      // Test all encoders in parallel for faster startup
      const testPromises = encodersToCheck.map(async (encoder) => {
        try {
          // Use lavfi color source to generate 1 test frame, encode it with the GPU encoder
          // Use 1280x720 for maximum compatibility with all encoder minimum requirements
          await execAsync(
            `"${ffmpegBinary}" -f lavfi -i color=black:s=1280x720:d=0.1 -c:v ${encoder} -frames:v 1 -f null ${nullDevice}`,
            {
              encoding: 'utf-8',
              timeout: 10000, // 10s timeout for GPU initialization
              windowsHide: true,
            }
          );
          // If we get here without exception, the encoder works!
          return { encoder, available: true };
        } catch {
          // Encoder failed - not available on this system
          return { encoder, available: false };
        }
      });

      const results = await Promise.all(testPromises);
      for (const { encoder, available } of results) {
        encoderStatus[encoder] = available;
      }
    } catch (error) {
      console.warn('[VideoCompressor] Failed to detect encoders:', error);
    }

    // Determine preferred encoders based on what's available
    let preferredH264: EncoderType = 'libx264';
    let preferredH265: EncoderType = 'libx265';

    // Check H.264 GPU encoders in priority order
    for (const encoder of ENCODER_MAP.h264.gpu) {
      if (encoderStatus[encoder]) {
        preferredH264 = encoder;
        break;
      }
    }

    // Check H.265 GPU encoders in priority order
    for (const encoder of ENCODER_MAP.h265.gpu) {
      if (encoderStatus[encoder]) {
        preferredH265 = encoder;
        break;
      }
    }

    const anyGpuAvailable = Object.values(encoderStatus).some((v) => v);

    this.hwAccelInfo = {
      available: anyGpuAvailable,
      encoders: encoderStatus,
      preferredH264,
      preferredH265,
    };

    return this.hwAccelInfo;
  }

  /**
   * Get cached hardware acceleration info (async)
   */
  async getHardwareAccelInfo(): Promise<HardwareAccelInfo> {
    return this.detectHardwareAccel();
  }

  /**
   * Select the best encoder based on options and hardware availability
   */
  private async selectEncoder(
    baseEncoder: 'libx264' | 'libx265',
    hwAccel: 'auto' | 'off'
  ): Promise<EncoderType> {
    if (hwAccel === 'off') {
      return baseEncoder;
    }

    const hwInfo = await this.detectHardwareAccel();
    if (baseEncoder === 'libx264') {
      return hwInfo.preferredH264;
    } else {
      return hwInfo.preferredH265;
    }
  }

  async compress(
    inputPath: string,
    outputPath: string,
    options: CompressionOptions,
    onProgress?: (progress: CompressionProgress) => void,
    onLog?: (message: string) => void
  ): Promise<string> {
    const log = (msg: string) => onLog && onLog(msg);
    const hwAccel = options.hwAccel ?? 'auto';

    // Select the best encoder based on options and hardware availability
    const selectedEncoder = await this.selectEncoder(options.encoder, hwAccel);
    const isGpuEncoder = selectedEncoder !== options.encoder;

    log(`[Compression] Starting compression: ${inputPath}`);
    log(`[Compression] Output: ${outputPath}`);
    log(
      `[Compression] Base encoder: ${options.encoder}, Selected: ${selectedEncoder}${isGpuEncoder ? ' (GPU)' : ' (CPU)'}`
    );
    log(`[Compression] Hardware acceleration: ${hwAccel}`);
    log(`[Compression] CRF: ${options.crf}`);
    if ((options.width && options.width > 0) || (options.height && options.height > 0)) {
      log(`[Compression] Resolution target: ${options.width || '?'}x${options.height || '?'}`);
    }
    if (options.subtitlePath) {
      log(`[Compression] Subtitle: ${options.subtitlePath}`);
    }

    // Try GPU encoder first, fallback to CPU if it fails
    try {
      return await this.runCompression(
        inputPath,
        outputPath,
        options,
        selectedEncoder,
        onProgress,
        log
      );
    } catch (error: any) {
      // If GPU encoding failed and we were using GPU, try CPU fallback
      // But NOT if the user cancelled the operation
      if (isGpuEncoder && hwAccel === 'auto' && !this.isCancelled) {
        log(`[Compression] GPU encoding failed, falling back to CPU encoder: ${options.encoder}`);
        console.warn('[VideoCompressor] GPU encoding failed, falling back to CPU:', error.message);

        // Clean up failed output file if it exists
        if (fs.existsSync(outputPath)) {
          try {
            fs.unlinkSync(outputPath);
          } catch (e) {
            console.warn('[VideoCompressor] Failed to clean up failed output:', e);
          }
        }

        return await this.runCompression(
          inputPath,
          outputPath,
          options,
          options.encoder,
          onProgress,
          log
        );
      }
      throw error;
    }
  }

  /**
   * Internal method to run the actual compression
   */
  private runCompression(
    inputPath: string,
    outputPath: string,
    options: CompressionOptions,
    encoder: EncoderType,
    onProgress?: (progress: CompressionProgress) => void,
    log?: (message: string) => void
  ): Promise<string> {
    const logMsg = (msg: string) => log && log(msg);

    // Reset cancellation flag at the start of new compression
    this.isCancelled = false;

    return new Promise((resolve, reject) => {
      // Validate input file exists
      if (!fs.existsSync(inputPath)) {
        const errMsg = `Input file does not exist: ${inputPath}`;
        logMsg(`[ERROR] [Compression] ${errMsg}`);
        reject(new Error(errMsg));
        return;
      }
      logMsg(`[Compression] Input file verified: ${inputPath}`);
      logMsg(`[Compression] Using encoder: ${encoder}`);

      let command = ffmpeg(inputPath)
        .output(outputPath)
        .videoCodec(encoder)
        // Enable verbose logging
        .addInputOption('-v', 'verbose');

      // GPU encoders use different quality control methods
      const isGpuEncoder = !encoder.startsWith('lib');

      if (isGpuEncoder) {
        // GPU encoders (NVENC/QSV/AMF) use -cq or -global_quality instead of -crf
        // NVENC uses -cq, QSV uses -global_quality, AMF uses -qp_*
        if (encoder.includes('nvenc')) {
          // NVENC: Use VBR mode for better compression efficiency
          // VBR with CQ target provides good quality while controlling file size
          command.addOutputOption('-rc', 'vbr');
          command.addOutputOption('-cq', String(options.crf));
          // Set max bitrate based on CRF to prevent file size explosion
          // Lower CRF = higher quality = higher maxrate allowed
          const maxBitrate = Math.max(2000, Math.round(8000 * Math.pow(0.9, options.crf - 18)));
          command.addOutputOption('-maxrate', `${maxBitrate}k`);
          command.addOutputOption('-bufsize', `${maxBitrate * 2}k`);
          // Preset p5 = slower but better compression (p4 was too fast/inefficient)
          command.addOutputOption('-preset', 'p5');
          // Advanced quality options:
          command.addOutputOption('-b_ref_mode', 'middle'); // Use middle frame as B-ref (better quality)
          command.addOutputOption('-spatial_aq', '1'); // Spatial Adaptive Quantization
          command.addOutputOption('-temporal_aq', '1'); // Temporal AQ (reduce flickering)
          command.addOutputOption('-rc-lookahead', '32'); // Lookahead frames for better bitrate allocation
          command.addOutputOption('-bf', '3'); // 3 B-frames for better compression
          // Note: weighted_pred is not supported with B-frames in NVENC
        } else if (encoder.includes('qsv')) {
          // QSV (Intel Quick Sync): Enhanced quality settings
          command.addOutputOption('-global_quality', String(options.crf));
          command.addOutputOption('-preset', 'medium');
          command.addOutputOption('-look_ahead', '1'); // Enable lookahead
          command.addOutputOption('-look_ahead_depth', '40'); // Lookahead depth for better quality
          command.addOutputOption('-adaptive_i', '1'); // Adaptive I-frame insertion
          command.addOutputOption('-adaptive_b', '1'); // Adaptive B-frame insertion
          command.addOutputOption('-b_strategy', '1'); // B-frame strategy
        } else if (encoder.includes('amf')) {
          // AMF (AMD VCE/VCN): Enhanced quality settings
          // Note: AMF uses 'true'/'false' for boolean options, not '1'/'0'
          command.addOutputOption('-rc', 'cqp');
          command.addOutputOption('-qp_i', String(options.crf));
          command.addOutputOption('-qp_p', String(options.crf));
          command.addOutputOption('-qp_b', String(options.crf + 2)); // Slightly higher QP for B-frames
          command.addOutputOption('-quality', 'balanced');
          command.addOutputOption('-preanalysis', 'true'); // Pre-analysis for better encoding decisions
          command.addOutputOption('-vbaq', 'true'); // Variance-based Adaptive Quantization
        }
      } else {
        // CPU encoders use CRF
        command.addOutputOption(`-crf ${options.crf}`);
        command.addOutputOption('-preset medium');

        // Add advanced x264 params to match Maruko Toolbox (小丸工具箱)
        if (options.encoder === 'libx264') {
          // Log: --crf 23.5 --preset 8 -I 300 -r 4 -b 3 --me umh -i 1 --scenecut 60 -f 1:1 --qcomp 0.5 --psy-rd 0.3:0 --aq-mode 2 --aq-strength 0.8
          // Additional from x264 info: subme=10, merange=24, trellis=2, direct=auto, b_adapt=2, rc_lookahead=60
          // Note: psy-rd and deblock values use comma (,) instead of colon (:) as internal separator
          // because x264-params uses colon to separate different parameters
          command.addOutputOption(
            '-x264-params',
            'keyint=300:min-keyint=1:ref=4:bframes=3:b-adapt=2:me=umh:merange=24:subme=10:trellis=2:direct=auto:scenecut=60:qcomp=0.5:psy-rd=0.3,0:aq-mode=2:aq-strength=0.8:deblock=1,1:rc-lookahead=60'
          );
        }
      }

      if ((options.width && options.width > 0) || (options.height && options.height > 0)) {
        const w = options.width && options.width > 0 ? options.width : '?';
        const h = options.height && options.height > 0 ? options.height : '?';
        command = command.size(`${w}x${h}`);
        command.addOutputOption('-sws_flags', 'lanczos'); // Use Lanczos scaler
      }

      // Subtitle Hardsub
      let tempSubtitlePath: string | null = null;
      if (options.subtitlePath) {
        // ffmpeg's filter graph parser has multiple escaping levels with many special chars:
        // Level 1 (option value): ' \ :
        // Level 2 (filter description): ' \ [ ] , ;
        // Plus non-ASCII (emoji, CJK) breaks the parser entirely.
        // Instead of blacklisting each one, use a whitelist: only allow characters that are
        // definitely safe in filter paths. Copy to temp for anything else.
        // See: MIOSUB-6 investigation — 5 users hit this with emoji, CJK, apostrophes, parentheses.
        let subtitlePathForFilter = options.subtitlePath;
        const isSafePath = /^[a-zA-Z0-9 ._\-/\\:]+$/.test(options.subtitlePath);
        const hasUnsafeChars = !isSafePath;
        if (hasUnsafeChars) {
          const safeTempDir = path.join(os.tmpdir(), 'miosub-subs');
          fs.mkdirSync(safeTempDir, { recursive: true });
          tempSubtitlePath = path.join(safeTempDir, `sub_${Date.now()}.ass`);
          fs.copyFileSync(options.subtitlePath, tempSubtitlePath);
          subtitlePathForFilter = tempSubtitlePath;
          logMsg(
            `[Compression] Subtitle path contains unsafe chars, copied to safe path: ${tempSubtitlePath}`
          );
        }

        // Escape path for FFmpeg filter (libavfilter escaping rules):
        // 1. Convert backslashes to forward slashes (Windows path compatibility)
        // 2. Escape colons (required for Windows drive letters like C:/)
        // 3. Escape single quotes with backslash (FFmpeg filter escaping, NOT shell escaping)
        //    - Shell escaping uses '\'' but fluent-ffmpeg passes args directly without shell
        //    - FFmpeg filter parser expects \' for literal single quote inside single-quoted string
        // 4. Escape brackets [ and ] (FFmpeg treats them as special characters)
        const escapedPath = subtitlePathForFilter
          .replace(/\\/g, '/')
          .replace(/:/g, '\\:')
          .replace(/'/g, "\\'")
          .replace(/\[/g, '\\[')
          .replace(/\]/g, '\\]');
        logMsg(`[Compression] Subtitle path escaped: ${escapedPath}`);

        let subtitleFilter = `subtitles='${escapedPath}'`;

        // Check for bundled fonts directory
        const fontsDir = path.join(getResourcesPath(), 'fonts');
        if (fs.existsSync(fontsDir)) {
          // Escape fonts dir using same FFmpeg filter escaping rules
          const escapedFontsDir = fontsDir
            .replace(/\\/g, '/')
            .replace(/:/g, '\\:')
            .replace(/'/g, "\\'")
            .replace(/\[/g, '\\[')
            .replace(/\]/g, '\\]');

          subtitleFilter += `:fontsdir='${escapedFontsDir}'`;
          logMsg(`[Compression] Using bundled fonts from: ${escapedFontsDir}`);
        }

        command.videoFilters(subtitleFilter);
      }

      // Store command reference for potential cancellation
      this.activeCommand = { command, outputPath };

      command
        .on('start', (cmdLine) => {
          logMsg(`[DEBUG] [FFmpeg] Full command: ${cmdLine}`);
          console.log('[DEBUG] [FFmpeg] Command:', cmdLine);
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
          // Filter out verbose FFmpeg output to reduce console noise
          // Only log actual errors and important warnings
          const trimmedLine = stderrLine.trim();

          // Skip empty lines
          if (!trimmedLine) return;

          // Skip progress lines (frame=... fps=... size=... etc)
          if (/^frame=\s*\d+\s+fps=/.test(trimmedLine)) return;

          // Skip subtitle parsing events (unless related to fonts)
          if (/^\[Parsed_subtitles_\d+\s*@/.test(trimmedLine) && !trimmedLine.includes('font'))
            return;

          // Skip FFmpeg version/build info
          if (/^ffmpeg version|^built with|^configuration:|^lib(av|sw|postproc)/.test(trimmedLine))
            return;

          // Skip stream/codec info
          if (
            /^Stream #|^Stream mapping:|^Input #|^Output #|^Metadata:|Duration:|^\s+Stream\s/.test(
              trimmedLine
            )
          )
            return;

          // Skip common info messages
          if (
            /^Press \[q\]|^graph_\d+_in|^\s*(major_brand|minor_version|compatible_brands|encoder|handler_name)\s*:/.test(
              trimmedLine
            )
          )
            return;

          // Skip ASS/subtitle format info (headers, styles, events)
          if (
            /^\[Script Info\]|^Title:|^ScriptType:|^WrapStyle:|^ScaledBorderAndShadow|^YCbCr Matrix|^PlayRes[XY]|^\[V4\+ Styles\]|^Format:|^Style:|^\[Events\]|^Event at \d+/.test(
              trimmedLine
            )
          )
            return;

          // Skip decoder/filter initialization messages
          if (/^\[.*@\s*[0-9a-f]+\]/.test(trimmedLine) && !/error|fail|invalid/i.test(trimmedLine))
            return;

          // Log only errors and warnings from what remains
          const lowerLine = trimmedLine.toLowerCase();
          if (
            lowerLine.includes('error') ||
            lowerLine.includes('exception') ||
            lowerLine.includes('failed') ||
            lowerLine.includes('warning') ||
            lowerLine.includes('fatal') ||
            lowerLine.includes('panic')
          ) {
            console.warn('[VideoCompressor] [FFmpeg stderr]', stderrLine);
            logMsg(`[WARN] [FFmpeg] ${stderrLine}`);
          }
        })
        .on('end', () => {
          this.activeCommand = null;
          if (tempSubtitlePath) {
            try {
              fs.unlinkSync(tempSubtitlePath);
            } catch {
              /* ignore */
            }
          }
          logMsg(`[Compression] Completed: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (err, stdout, stderr) => {
          this.activeCommand = null;
          if (tempSubtitlePath) {
            try {
              fs.unlinkSync(tempSubtitlePath);
            } catch {
              /* ignore */
            }
          }
          // Check if this was a user cancellation
          if (this.isCancelled) {
            logMsg(`[Compression] Cancelled by user`);
            const cancelError = new Error('CANCELLED');
            cancelError.name = 'CancellationError';
            reject(cancelError);
            return;
          }
          logMsg(`[ERROR] [Compression] Failed: ${err.message}`);
          console.error('[FFmpeg] Error:', err.message);
          console.error('[FFmpeg] stderr:', stderr);
          logMsg(`[ERROR] [FFmpeg stderr]: ${stderr}`);
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
        this.isCancelled = true; // Set flag before killing
        (this.activeCommand.command as any).kill('SIGTERM');

        // Cleanup output file
        const outputPath = this.activeCommand.outputPath;
        setTimeout(() => {
          if (fs.existsSync(outputPath)) {
            try {
              fs.unlinkSync(outputPath);
              console.log(`[VideoCompressor] Deleted partial file: ${outputPath}`);
            } catch (e) {
              console.warn(`[VideoCompressor] Failed to delete partial file ${outputPath}:`, e);
            }
          }
        }, 500);

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

// Singleton instance for app-wide cleanup
let compressorInstance: VideoCompressorService | null = null;

export function getCompressorInstance(): VideoCompressorService {
  if (!compressorInstance) {
    compressorInstance = new VideoCompressorService();
  }
  return compressorInstance;
}

/**
 * Kill active compression process (call on app quit).
 */
export function killActiveCompression(): void {
  compressorInstance?.cancel();
}
