/**
 * 阶段 Payload 转换函数
 *
 * 将 SubtitleItem 转换为各阶段发送给 LLM 的格式，
 * 确保内部标记不会被误发送。
 */

import type { SubtitleItem } from '@/types/subtitle';
import { timeToSeconds } from '@/services/subtitle/time';

// ============================================================================
// 类型定义
// ============================================================================

/** Refinement 阶段：发送给 LLM 校正的格式 */
export interface RefinementPayload {
  id?: string;
  start: string;
  end: string;
  text: string;
  speaker?: string;
}

/** Translation 阶段：发送给 LLM 翻译的格式 */
export interface TranslationPayload {
  id: string;
  start: string;
  end: string;
  text_original: string;
  speaker?: string;
}

/** Batch 操作：发送给 LLM 润色的格式 */
export interface BatchPayload {
  id: string;
  start: string;
  end: string;
  text_original: string;
  text_translated: string;
  speaker?: string;
  comment?: string;
}

/** Alignment 阶段：发送给 CTC Aligner 的格式 */
export interface AlignmentPayload {
  index: number;
  text: string;
  start?: number;
  end?: number;
}

// ============================================================================
// 转换选项
// ============================================================================

export interface TranslationPayloadOptions {
  /** 是否包含 speaker 字段（用于风格化翻译） */
  includeSpeaker?: boolean;
}

export interface RefinementPayloadOptions {
  /** 是否包含 speaker 字段 */
  includeSpeaker?: boolean;
}

// ============================================================================
// 转换函数
// ============================================================================

/**
 * 转换为 Refinement 阶段的 Payload
 */
export function toRefinementPayload(
  seg: SubtitleItem,
  options?: RefinementPayloadOptions
): RefinementPayload {
  const payload: RefinementPayload = {
    id: seg.id,
    start: seg.startTime,
    end: seg.endTime,
    text: seg.original,
  };

  if (options?.includeSpeaker && seg.speaker) {
    payload.speaker = seg.speaker;
  }

  return payload;
}

/**
 * 转换为 Translation 阶段的 Payload
 */
export function toTranslationPayload(
  seg: SubtitleItem,
  options?: TranslationPayloadOptions
): TranslationPayload {
  const payload: TranslationPayload = {
    id: seg.id,
    start: seg.startTime,
    end: seg.endTime,
    text_original: seg.original,
  };

  if (options?.includeSpeaker && seg.speaker) {
    payload.speaker = seg.speaker;
  }

  return payload;
}

/**
 * 转换为 Batch 操作的 Payload
 */
export function toBatchPayload(
  seg: SubtitleItem,
  relativeStart?: string,
  relativeEnd?: string
): BatchPayload {
  const payload: BatchPayload = {
    id: seg.id,
    start: relativeStart ?? seg.startTime,
    end: relativeEnd ?? seg.endTime,
    text_original: seg.original,
    text_translated: seg.translated ?? '',
  };

  if (seg.speaker) {
    payload.speaker = seg.speaker;
  }

  if (seg.comment) {
    payload.comment = seg.comment;
  }

  return payload;
}

/**
 * 转换为 Alignment 阶段的 Payload
 */
export function toAlignmentPayload(seg: SubtitleItem, index: number): AlignmentPayload {
  return {
    index,
    text: seg.original,
    start: timeToSeconds(seg.startTime),
    end: timeToSeconds(seg.endTime),
  };
}

// ============================================================================
// 批量转换辅助函数
// ============================================================================

/**
 * 批量转换为 Refinement Payload
 */
export function toRefinementPayloads(
  segs: SubtitleItem[],
  options?: RefinementPayloadOptions
): RefinementPayload[] {
  return segs.map((seg) => toRefinementPayload(seg, options));
}

/**
 * 批量转换为 Translation Payload
 */
export function toTranslationPayloads(
  segs: SubtitleItem[],
  options?: TranslationPayloadOptions
): TranslationPayload[] {
  return segs.map((seg) => toTranslationPayload(seg, options));
}

/**
 * 批量转换为 Batch Payload
 */
export function toBatchPayloads(segs: SubtitleItem[]): BatchPayload[] {
  return segs.map((seg) => toBatchPayload(seg));
}

/**
 * 批量转换为 Alignment Payload
 */
export function toAlignmentPayloads(segs: SubtitleItem[]): AlignmentPayload[] {
  return segs.map((seg, index) => toAlignmentPayload(seg, index));
}
