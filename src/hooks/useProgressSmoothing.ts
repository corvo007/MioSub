/**
 * useProgressSmoothing Hook - Smooth progress animation with interpolation
 *
 * Provides smooth progress bar animation using requestAnimationFrame
 * and optional sliding window averaging for numeric fields.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

export interface ProgressSmoothingOptions<T> {
  /** Interpolation speed (0-1), higher = faster catch-up. Default: 0.08 */
  interpolationSpeed?: number;

  /** Sliding average window size. Default: 5 */
  smoothingWindow?: number;

  /** Numeric fields to apply sliding average. Default: [] */
  smoothedFields?: (keyof T)[];

  /** Field that triggers reset when changed (e.g., 'stage'). Default: undefined */
  resetOnFieldChange?: keyof T;

  /** Minimum progress increment per frame (prevents stalling). Default: 0.01 */
  minProgressPerFrame?: number;

  /** Maximum progress increment per frame (prevents jumping). Default: 2.0 */
  maxProgressPerFrame?: number;
}

interface UseProgressSmoothingReturn<T> {
  /** Smoothed progress data */
  smoothed: T | null;
  /** Raw progress data */
  raw: T | null;
  /** Whether animation is currently running */
  isAnimating: boolean;
  /** Reset smoothing state */
  reset: () => void;
}

/**
 * Moving average calculator for smooth numeric values
 */
class MovingAverage {
  private window: number[] = [];
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  push(value: number): number {
    this.window.push(value);
    if (this.window.length > this.maxSize) {
      this.window.shift();
    }
    return this.window.reduce((a, b) => a + b, 0) / this.window.length;
  }

  reset(): void {
    this.window = [];
  }
}

/**
 * Hook for smoothing progress updates with animation interpolation
 */
export function useProgressSmoothing<T extends { percent: number }>(
  rawProgress: T | null,
  options: ProgressSmoothingOptions<T> = {}
): UseProgressSmoothingReturn<T> {
  const {
    interpolationSpeed = 0.08,
    smoothingWindow = 5,
    smoothedFields = [],
    resetOnFieldChange,
    minProgressPerFrame = 0.01,
    maxProgressPerFrame = 2.0,
  } = options;

  const [smoothedProgress, setSmoothedProgress] = useState<T | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  // Refs for animation state
  const currentPercentRef = useRef<number>(0);
  const targetPercentRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);
  const lastResetFieldValueRef = useRef<unknown>(undefined);
  const movingAveragesRef = useRef<Map<keyof T, MovingAverage>>(new Map());

  // Memoize smoothedFields key for dependency array
  const smoothedFieldsKey = smoothedFields.join(',');

  // Initialize moving averages for smoothed fields
  useEffect(() => {
    const averages = new Map<keyof T, MovingAverage>();
    for (const field of smoothedFields) {
      averages.set(field, new MovingAverage(smoothingWindow));
    }
    movingAveragesRef.current = averages;
  }, [smoothedFieldsKey, smoothingWindow, smoothedFields]);

  // Reset function
  const reset = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    currentPercentRef.current = 0;
    targetPercentRef.current = 0;
    lastResetFieldValueRef.current = undefined;
    setSmoothedProgress(null);
    setIsAnimating(false);

    // Reset all moving averages
    movingAveragesRef.current.forEach((avg) => avg.reset());
  }, []);

  // Animation loop
  useEffect(() => {
    if (!rawProgress) {
      // If raw progress becomes null, stop animation but keep last smoothed value
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      setIsAnimating(false);
      return;
    }

    // Check for reset field change
    if (resetOnFieldChange) {
      const currentFieldValue = rawProgress[resetOnFieldChange];
      if (
        lastResetFieldValueRef.current !== undefined &&
        lastResetFieldValueRef.current !== currentFieldValue
      ) {
        // Field changed, reset smoothing state
        currentPercentRef.current = 0;
        movingAveragesRef.current.forEach((avg) => avg.reset());
      }
      lastResetFieldValueRef.current = currentFieldValue;
    }

    // Update target percent
    targetPercentRef.current = rawProgress.percent;

    // Start animation if not already running
    if (rafIdRef.current === null) {
      setIsAnimating(true);

      const animate = () => {
        const target = targetPercentRef.current;
        let current = currentPercentRef.current;

        // Calculate interpolation step
        const delta = target - current;

        if (Math.abs(delta) < 0.1) {
          // Close enough, snap to target
          current = target;
        } else {
          // Exponential easing with clamped step
          let step = delta * interpolationSpeed;
          const absStep = Math.abs(step);

          // Clamp step size
          if (absStep < minProgressPerFrame && delta !== 0) {
            step = minProgressPerFrame * Math.sign(delta);
          } else if (absStep > maxProgressPerFrame) {
            step = maxProgressPerFrame * Math.sign(delta);
          }

          // Monotonic increase (never go backwards)
          current = Math.max(current, current + step);
        }

        currentPercentRef.current = current;

        // Build smoothed progress object
        setSmoothedProgress((prev) => {
          if (!rawProgress) return prev;

          const result = { ...rawProgress, percent: current };

          // Apply moving average to specified fields
          for (const field of smoothedFields) {
            const avg = movingAveragesRef.current.get(field);
            const rawValue = rawProgress[field];
            if (avg && typeof rawValue === 'number') {
              (result as Record<keyof T, unknown>)[field] = avg.push(rawValue);
            }
          }

          return result;
        });

        // Continue animation if not at target
        if (Math.abs(target - current) > 0.01) {
          rafIdRef.current = requestAnimationFrame(animate);
        } else {
          rafIdRef.current = null;
          setIsAnimating(false);
        }
      };

      rafIdRef.current = requestAnimationFrame(animate);
    }

    return () => {
      // Don't cancel on every update, only on unmount
    };
  }, [
    rawProgress,
    interpolationSpeed,
    minProgressPerFrame,
    maxProgressPerFrame,
    resetOnFieldChange,
    smoothedFields,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  return {
    smoothed: smoothedProgress,
    raw: rawProgress,
    isAnimating,
    reset,
  };
}
