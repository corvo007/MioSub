import { useRef, useCallback } from 'react';

// 默认阈值 - 避免下拉菜单被截断
const DEFAULT_MIN_SPACE_BELOW = 220;
const DEFAULT_MIN_SPACE_RIGHT = 150;

interface UseDropdownDirectionOptions {
  minSpaceBelow?: number;
  minSpaceRight?: number;
}

interface DropdownDirection {
  dropUp: boolean;
  dropLeft: boolean;
}

/**
 * 统一的下拉方向检测 Hook
 * 支持 zoom 感知，返回是否应向上/向左展开
 *
 * @example
 * const { ref, getDirection } = useDropdownDirection<HTMLDivElement>();
 *
 * const toggleOpen = () => {
 *   const { dropUp } = getDirection();
 *   setDropUp(dropUp);
 *   setIsOpen(!isOpen);
 * };
 */
export function useDropdownDirection<T extends HTMLElement>(
  options: UseDropdownDirectionOptions = {}
) {
  const ref = useRef<T>(null);

  const { minSpaceBelow = DEFAULT_MIN_SPACE_BELOW, minSpaceRight = DEFAULT_MIN_SPACE_RIGHT } =
    options;

  const getDirection = useCallback((): DropdownDirection => {
    if (!ref.current) return { dropUp: false, dropLeft: false };

    const rect = ref.current.getBoundingClientRect();

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceRight = window.innerWidth - rect.right;

    return {
      dropUp: spaceBelow < minSpaceBelow,
      dropLeft: spaceRight < minSpaceRight,
    };
  }, [minSpaceBelow, minSpaceRight]);

  return { ref, getDirection };
}

// 导出常量供需要自定义阈值的组件使用
export { DEFAULT_MIN_SPACE_BELOW, DEFAULT_MIN_SPACE_RIGHT };
