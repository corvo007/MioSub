/**
 * End-to-End Pipeline Types
 * 端到端自动化流程的类型定义
 */

import { ChunkStatus } from '@/types/api';
import { SubtitleItem } from '@/types/subtitle';
import { DownloadProgress, VideoInfo } from '@electron/services/ytdlp';
import { CompressionProgress } from '@electron/services/videoCompressor';

// ============================================================================
// Pipeline Stage Definitions
// ============================================================================

/** Pipeline 阶段枚举 */
export type PipelineStage =
  | 'idle' // 空闲
  | 'downloading' // 下载视频
  | 'extracting_audio' // 提取音频
  | 'transcribing' // 转录
  | 'extracting_glossary' // 提取术语 (自动确认)
  | 'extracting_speakers' // 提取说话人
  | 'refining' // 润色
  | 'translating' // 翻译
  | 'exporting_subtitle' // 导出字幕
  | 'compressing' // 压制视频
  | 'completed' // 完成
  | 'failed'; // 失败

/** 阶段权重配置 (用于计算总进度) */
export const STAGE_WEIGHTS: Record<PipelineStage, number> = {
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

// ============================================================================
// Configuration Types
// ============================================================================

/** 端到端配置 */
export interface EndToEndConfig {
  // 输入
  url: string; // 视频链接
  videoInfo?: VideoInfo; // 已解析的视频信息（避免重复解析）

  // 输出
  outputDir: string; // 输出目录

  // 下载选项
  downloadFormat?: string; // 格式选择 (如 '1080p', '720p')
  downloadThumbnail?: boolean; // 是否下载封面

  // 字幕选项
  sourceLanguage: string; // 源语言 (如 'ja', 'en')
  targetLanguage: string; // 目标语言 (如 'zh-CN')
  genre: string; // 内容类型

  // Whisper 选项
  useLocalWhisper: boolean; // 使用本地 Whisper
  whisperModel?: string; // Whisper 模型路径 (如果使用本地)

  // 高级选项
  enableGlossary: boolean; // 启用术语提取 (自动确认)
  enableDiarization: boolean; // 启用说话人识别
  minSpeakers?: number; // 最少说话人数 (可选)
  maxSpeakers?: number; // 最多说话人数 (可选)
  enableSpeakerPreAnalysis?: boolean; // 启用说话人预分析 (提高质量)

  // 压制选项
  enableCompression: boolean; // 是否启用压制
  compressionEncoder: 'libx264' | 'libx265'; // 编码器
  compressionCrf: number; // CRF 质量值 (0-51, 越小越好)
  compressionResolution: 'original' | '1080p' | '720p' | '480p'; // 分辨率
  useHardwareAccel: boolean; // 使用 GPU 加速
  embedSubtitle: boolean; // 内嵌字幕到视频

  // 输出格式
  outputMode: 'bilingual' | 'target_only'; // 双语/仅目标语言
  subtitleFormat: 'srt' | 'ass'; // 字幕格式
  includeSpeaker?: boolean; // 在字幕文本中显示说话人名称
  useSpeakerColors?: boolean; // 使用不同颜色区分说话人 (仅 ASS)
  useSpeakerStyledTranslation?: boolean; // 根据说话人特征调整翻译语气
}

/** 默认配置 */
export const DEFAULT_END_TO_END_CONFIG: Partial<EndToEndConfig> = {
  downloadThumbnail: true,
  sourceLanguage: 'ja',
  targetLanguage: 'zh-CN',
  genre: 'anime',
  useLocalWhisper: false,
  enableGlossary: true,
  enableDiarization: true,
  enableSpeakerPreAnalysis: false,
  enableCompression: true,
  compressionEncoder: 'libx264',
  compressionCrf: 23,
  compressionResolution: 'original',
  useHardwareAccel: true,
  embedSubtitle: true,
  outputMode: 'bilingual',
  subtitleFormat: 'ass',
};

// ============================================================================
// Progress Types
// ============================================================================

/** Pipeline 进度 */
export interface PipelineProgress {
  /** 当前阶段 */
  stage: PipelineStage;

  /** 当前阶段进度 (0-100) */
  stageProgress: number;

  /** 总体进度 (0-100) */
  overallProgress: number;

  /** 当前状态消息 */
  message: string;

  /** 当前阶段开始时间 */
  stageStartTime?: number;

  /** Pipeline 开始时间 */
  pipelineStartTime?: number;

  // 阶段特定数据
  /** 下载进度详情 */
  downloadProgress?: DownloadProgress;

  /** 转录进度详情 (各 chunk 状态) */
  transcribeProgress?: ChunkStatus[];

  /** 压制进度详情 */
  compressProgress?: CompressionProgress;

  /** 视频信息 (下载阶段获取) */
  videoInfo?: VideoInfo;
}

/** 阶段完成产出 */
export interface StageOutput {
  /** 下载的视频路径 */
  videoPath?: string;

  /** 提取的音频路径 */
  audioPath?: string;

  /** 封面路径 */
  thumbnailPath?: string;

  /** 生成的字幕 */
  subtitles?: SubtitleItem[];

  /** 导出的字幕文件路径 */
  subtitlePath?: string;

  /** 压制后的视频路径 */
  outputVideoPath?: string;
}

// ============================================================================
// Result Types
// ============================================================================

/** Pipeline 结果 */
export interface PipelineResult {
  /** 是否成功 */
  success: boolean;

  /** 最终到达的阶段 */
  finalStage: PipelineStage;

  /** 各阶段产出 */
  outputs: StageOutput;

  /** 处理总耗时 (毫秒) */
  duration: number;

  /** 错误信息 (如果失败) */
  error?: string;

  /** 详细错误 (如果失败) */
  errorDetails?: {
    stage: PipelineStage;
    message: string;
    originalError?: string;
    retryable?: boolean;
  };
}

// ============================================================================
// IPC Types (Electron <-> Renderer)
// ============================================================================

/** 启动 Pipeline 请求 */
export interface StartPipelineRequest {
  config: EndToEndConfig;
}

/** Pipeline 进度更新事件 */
export interface PipelineProgressEvent {
  progress: PipelineProgress;
}

/** Pipeline 完成事件 */
export interface PipelineCompleteEvent {
  result: PipelineResult;
}

// ============================================================================
// Wizard UI Types
// ============================================================================

/** 向导步骤 */
export type WizardStep = 'input' | 'config' | 'progress' | 'result';

/** 向导状态 */
export interface WizardState {
  /** 当前步骤 */
  currentStep: WizardStep;

  /** 配置 */
  config: Partial<EndToEndConfig>;

  /** 视频信息 (解析后获取) */
  videoInfo?: VideoInfo;

  /** Pipeline 进度 */
  progress?: PipelineProgress;

  /** Pipeline 结果 */
  result?: PipelineResult;

  /** 是否正在解析 URL */
  isParsing: boolean;

  /** 是否正在执行 Pipeline */
  isExecuting: boolean;

  /** 解析错误 */
  parseError?: string;
}
