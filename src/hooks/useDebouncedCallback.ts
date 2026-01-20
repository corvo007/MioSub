/**
 * useDebouncedCallback Hook
 * 防抖回调 Hook - 防止重复点击触发多次操作
 *
 * 用于关键操作按钮（AI生成、压制、下载等），避免用户快速多次点击导致的重复请求。
 */

import { useCallback, useRef } from 'react';

/** 默认防抖延迟：1秒 */
const DEFAULT_DEBOUNCE_DELAY = 1000;

/**
 * 创建防抖版本的回调函数
 * @param callback - 原始回调函数
 * @param delay - 防抖延迟时间（毫秒），默认 1000ms
 * @returns 防抖后的回调函数
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number = DEFAULT_DEBOUNCE_DELAY
): (...args: Parameters<T>) => ReturnType<T> | undefined {
  // 使用单一的 ref 存储 lastCallTime 和 callback
  // 这样可以确保 hooks 调用顺序稳定
  const stateRef = useRef({
    lastCallTime: 0,
    callback: callback,
  });

  // 更新 callback 引用（不创建新的 ref）
  stateRef.current.callback = callback;

  // 返回稳定的防抖函数
  return useCallback(
    (...args: Parameters<T>): ReturnType<T> | undefined => {
      const now = Date.now();
      if (now - stateRef.current.lastCallTime < delay) {
        // 在防抖间隔内，忽略此次调用
        return undefined;
      }
      stateRef.current.lastCallTime = now;
      return stateRef.current.callback(...args);
    },
    [delay]
  );
}
