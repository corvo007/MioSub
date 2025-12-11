import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobePath from 'ffprobe-static';
import fs from 'fs';
import { execSync } from 'child_process';

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

const fixPathForAsar = (pathStr: string) => {
  return pathStr.replace('app.asar', 'app.asar.unpacked');
};

// Set FFmpeg paths with null checks and logging
console.log('[VideoCompressor] Initializing FFmpeg paths...');
console.log('[VideoCompressor] ffmpegPath module:', ffmpegPath);
console.log('[VideoCompressor] ffprobePath module:', ffprobePath);

if (ffmpegPath) {
  const fixedPath = fixPathForAsar(ffmpegPath);
  console.log('[VideoCompressor] Setting FFmpeg path:', fixedPath);
  ffmpeg.setFfmpegPath(fixedPath);
} else {
  console.error('[VideoCompressor] ERROR: ffmpegPath is undefined!');
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
  hwAccel?: 'auto' | 'off'; // GPU hardware acceleration mode
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

  // Flag to track if compression was cancelled by user
  private isCancelled: boolean = false;

  // Cached hardware acceleration info
  private hwAccelInfo: HardwareAccelInfo | null = null;

  /**
   * Detect available GPU encoders by running ffmpeg -encoders
   * Results are cached for subsequent calls
   */
  detectHardwareAccel(): HardwareAccelInfo {
    if (this.hwAccelInfo) {
      return this.hwAccelInfo;
    }

    console.log('[VideoCompressor] Detecting hardware acceleration...');

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
      // Get the fixed FFmpeg path
      const ffmpegBinary = ffmpegPath ? fixPathForAsar(ffmpegPath) : 'ffmpeg';
      const output = execSync(`"${ffmpegBinary}" -encoders 2>&1`, {
        encoding: 'utf-8',
        timeout: 10000,
        windowsHide: true,
      });

      for (const encoder of encodersToCheck) {
        // Check if encoder is listed in the output
        if (output.includes(encoder)) {
          encoderStatus[encoder] = true;
          console.log(`[VideoCompressor] Found GPU encoder: ${encoder}`);
        }
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

    console.log('[VideoCompressor] Hardware acceleration info:', this.hwAccelInfo);
    return this.hwAccelInfo;
  }

  /**
   * Get cached hardware acceleration info
   */
  getHardwareAccelInfo(): HardwareAccelInfo {
    return this.detectHardwareAccel();
  }

  /**
   * Select the best encoder based on options and hardware availability
   */
  private selectEncoder(baseEncoder: 'libx264' | 'libx265', hwAccel: 'auto' | 'off'): EncoderType {
    if (hwAccel === 'off') {
      return baseEncoder;
    }

    const hwInfo = this.detectHardwareAccel();
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
    const selectedEncoder = this.selectEncoder(options.encoder, hwAccel);
    const isGpuEncoder = selectedEncoder !== options.encoder;

    log(`[Compression] Starting compression: ${inputPath}`);
    log(`[Compression] Output: ${outputPath}`);
    log(
      `[Compression] Base encoder: ${options.encoder}, Selected: ${selectedEncoder}${isGpuEncoder ? ' (GPU)' : ' (CPU)'}`
    );
    log(`[Compression] Hardware acceleration: ${hwAccel}`);
    log(`[Compression] CRF: ${options.crf}`);
    if (options.width && options.width > 0) {
      log(`[Compression] Resolution: ${options.width}x${options.height || '?'}`);
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
      if (isGpuEncoder && hwAccel === 'auto') {
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
        logMsg(`[Compression] Subtitle path escaped: ${escapedPath}`);
        command.videoFilters(`subtitles='${escapedPath}'`);
      }

      // Store command reference for potential cancellation
      this.activeCommand = command;

      command
        .on('start', (cmdLine) => {
          logMsg(`[DEBUG] [FFmpeg] Full command: ${cmdLine}`);
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
          // Filter out verbose FFmpeg output to reduce console noise
          // Only log actual errors and important warnings
          const trimmedLine = stderrLine.trim();

          // Skip empty lines
          if (!trimmedLine) return;

          // Skip progress lines (frame=... fps=... size=... etc)
          if (/^frame=\s*\d+\s+fps=/.test(trimmedLine)) return;

          // Skip subtitle parsing events
          if (/^\[Parsed_subtitles_\d+\s*@/.test(trimmedLine)) return;

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

          // Log everything else (errors, warnings, etc.)
          console.log('[FFmpeg stderr]', stderrLine);
          logMsg(`[FFmpeg] ${stderrLine}`);
        })
        .on('end', () => {
          this.activeCommand = null;
          logMsg(`[Compression] Completed: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (err, stdout, stderr) => {
          this.activeCommand = null;
          // Check if this was a user cancellation
          if (this.isCancelled) {
            logMsg(`[Compression] Cancelled by user`);
            reject(new Error('CANCELLED'));
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
