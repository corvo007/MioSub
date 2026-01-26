/**
 * Pipeline 元数据协调器
 *
 * 在 Pipeline 各阶段间自动协调元数据，解决：
 * 1. 阶段间元数据手动复制容易遗漏的问题
 * 2. Split/Merge 场景下元数据继承逻辑
 */

import type { SubtitleItem } from '@/types/subtitle';
import { timeToSeconds } from './time';

// ============================================================================
// 常量定义
// ============================================================================

/** 语义元数据：跨阶段保留，Split/Merge 时也继承 */
const SEMANTIC_FIELDS = ['speaker'] as const;
// Note: 'comment' is intentionally NOT inherited - it's a user instruction that should be cleared after processing

/** 状态标记：仅 1:1 映射时继承，Split/Merge 时丢弃 */
const INTERNAL_FIELDS = [
  'alignmentScore',
  'lowConfidence',
  'hasRegressionIssue',
  'hasCorruptedRangeIssue',
] as const;

/** 重叠阈值：source 和 target 至少 50% 重叠才算匹配 */
const OVERLAP_THRESHOLD = 0.5;

// ============================================================================
// 类型定义
// ============================================================================

export type SemanticField = (typeof SEMANTIC_FIELDS)[number];
export type InternalField = (typeof INTERNAL_FIELDS)[number];

export interface ReconcileOptions {
  /** 重叠阈值，默认 0.5 */
  overlapThreshold?: number;
}

interface MatchResult {
  /** 匹配到的 prev segments 索引 */
  prevIndices: number[];
  /** 每个匹配的重叠时长（秒） */
  overlaps: number[];
}

// ============================================================================
// 核心函数
// ============================================================================

/**
 * 管道协调器：将上一阶段的元数据带入当前阶段输出
 *
 * @param prev - 上一阶段输出（带完整元数据）
 * @param curr - 当前阶段输出（可能只有部分字段）
 * @param options - 可选配置
 *
 * @returns 合并后的 segments（curr 的数据 + prev 的元数据）
 *
 * 元数据继承规则：
 * - 语义元数据（speaker, comment）：始终继承
 * - 状态标记（alignmentScore 等）：仅 1:1 映射时继承，Split/Merge 时丢弃
 */
export function reconcile(
  prev: SubtitleItem[],
  curr: SubtitleItem[],
  options?: ReconcileOptions
): SubtitleItem[] {
  if (curr.length === 0) return [];
  if (prev.length === 0) return curr;

  const threshold = options?.overlapThreshold ?? OVERLAP_THRESHOLD;

  // 第一步：为每个 curr segment 找到匹配的 prev segments
  const allMatches = curr.map((currSeg) => findMatches(prev, currSeg, threshold));

  // 第二步：计算每个 prev segment 被多少个 curr segment 匹配（用于检测 Split）
  const prevMatchCounts = new Map<number, number>();
  for (const match of allMatches) {
    for (const prevIdx of match.prevIndices) {
      prevMatchCounts.set(prevIdx, (prevMatchCounts.get(prevIdx) || 0) + 1);
    }
  }

  // 第三步：合并元数据
  return curr.map((currSeg, currIdx) => {
    const match = allMatches[currIdx];
    return mergeMetadata(prev, match, currSeg, prevMatchCounts);
  });
}

// ============================================================================
// 匹配算法
// ============================================================================

/**
 * 计算两个时间段的重叠时长（秒）
 */
function calculateOverlapDuration(
  source: { startTime: string; endTime: string },
  target: { startTime: string; endTime: string }
): number {
  const sourceStart = timeToSeconds(source.startTime);
  const sourceEnd = timeToSeconds(source.endTime);
  const targetStart = timeToSeconds(target.startTime);
  const targetEnd = timeToSeconds(target.endTime);

  const overlapStart = Math.max(sourceStart, targetStart);
  const overlapEnd = Math.min(sourceEnd, targetEnd);

  return Math.max(0, overlapEnd - overlapStart);
}

/**
 * 计算重叠比例（相对于 target 的时长）
 */
function calculateOverlapRatio(
  source: { startTime: string; endTime: string },
  target: { startTime: string; endTime: string }
): number {
  const overlapDuration = calculateOverlapDuration(source, target);
  const targetDuration = timeToSeconds(target.endTime) - timeToSeconds(target.startTime);

  if (targetDuration <= 0) return 0;
  return overlapDuration / targetDuration;
}

/**
 * 为一个 curr segment 找到所有匹配的 prev segments
 */
function findMatches(prev: SubtitleItem[], currSeg: SubtitleItem, threshold: number): MatchResult {
  const prevIndices: number[] = [];
  const overlaps: number[] = [];

  prev.forEach((prevSeg, idx) => {
    const ratio = calculateOverlapRatio(prevSeg, currSeg);
    if (ratio >= threshold) {
      prevIndices.push(idx);
      overlaps.push(calculateOverlapDuration(prevSeg, currSeg));
    }
  });

  return { prevIndices, overlaps };
}

/**
 * 找到重叠时间最长的 prev segment 的索引
 */
function findDominantIndex(match: MatchResult): number | null {
  if (match.prevIndices.length === 0) return null;

  let maxIdx = 0;
  let maxOverlap = match.overlaps[0];

  for (let i = 1; i < match.overlaps.length; i++) {
    if (match.overlaps[i] > maxOverlap) {
      maxOverlap = match.overlaps[i];
      maxIdx = i;
    }
  }

  return match.prevIndices[maxIdx];
}

// ============================================================================
// 元数据合并
// ============================================================================

/**
 * 从匹配的 prev segments 中提取并合并元数据
 *
 * 规则：
 * - 优先级：当前阶段 > 继承
 * - 语义元数据（speaker, comment）：始终继承
 * - 状态标记（alignmentScore 等）：仅 1:1 映射时继承
 *
 * 1:1 映射判定：
 * - 当前 curr segment 只匹配到 1 个 prev segment
 * - 且该 prev segment 也只被 1 个 curr segment 匹配
 */
function mergeMetadata(
  prev: SubtitleItem[],
  match: MatchResult,
  currSeg: SubtitleItem,
  prevMatchCounts: Map<number, number>
): SubtitleItem {
  // 无匹配 → 只返回 curr 本身
  if (match.prevIndices.length === 0) {
    return currSeg;
  }

  // 找到主祖先（重叠最长的）
  const dominantIdx = findDominantIndex(match);
  if (dominantIdx === null) return currSeg;

  const dominant = prev[dominantIdx];

  // 判断是否为 1:1 映射
  const isOneToOne =
    match.prevIndices.length === 1 && // 当前 curr 只匹配 1 个 prev
    prevMatchCounts.get(dominantIdx) === 1; // 该 prev 也只被 1 个 curr 匹配

  // 合并元数据（当前阶段优先）
  const result: SubtitleItem = { ...currSeg };

  // 语义元数据：始终继承
  // Note: comment is NOT inherited - it's cleared after processing
  SEMANTIC_FIELDS.forEach((field) => {
    if (result[field] === undefined && dominant[field] !== undefined) {
      (result as any)[field] = dominant[field];
    }
  });

  // 状态标记：仅 1:1 映射时继承
  if (isOneToOne) {
    INTERNAL_FIELDS.forEach((field) => {
      if (result[field] === undefined && dominant[field] !== undefined) {
        (result as any)[field] = dominant[field];
      }
    });
  }

  return result;
}
