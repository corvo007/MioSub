import { useState, useRef, useCallback, useEffect, type RefObject } from 'react';
import { useOutsideClick } from './useOutsideClick';
import { useDropdownDirection, DEFAULT_MIN_SPACE_BELOW } from './useDropdownDirection';
import { isProgrammaticScroll } from '@/utils/programmaticScroll';

interface UseDropdownOptions {
  /** Initial open state */
  initialOpen?: boolean;
  /** Whether to close the dropdown when window scrolls */
  closeOnScroll?: boolean;
  /** Whether to recalculate position when window scrolls (if open). Ignored if closeOnScroll is true. */
  recalculateOnScroll?: boolean;
  /** Callback when state changes */
  onOpenChange?: (isOpen: boolean) => void;
  /** Minimum space below to avoid dropUp */
  minSpaceBelow?: number;
}

interface DropdownCoords {
  left: number;
  top: number;
  width: number;
  bottom: number;
}

// ... imports

/**
 * Unified hook for Dropdown Logic
 * ...
 */
export function useDropdown<
  TriggerT extends HTMLElement,
  ContentT extends HTMLElement = HTMLElement,
>(options: UseDropdownOptions = {}) {
  const {
    initialOpen = false,
    closeOnScroll = true,
    recalculateOnScroll = false,
    onOpenChange,
    minSpaceBelow = DEFAULT_MIN_SPACE_BELOW,
  } = options;

  const [isOpen, setIsOpenState] = useState(initialOpen);
  const [coords, setCoords] = useState<DropdownCoords>({ left: 0, top: 0, width: 0, bottom: 0 });

  const { ref: triggerRef, getDirection } = useDropdownDirection<TriggerT>({ minSpaceBelow });
  const contentRef = useRef<ContentT>(null);

  const [direction, setDirection] = useState({ dropUp: false, dropLeft: false });

  const setIsOpen = useCallback(
    (newState: boolean) => {
      setIsOpenState(newState);
      onOpenChange?.(newState);
    },
    [onOpenChange]
  );

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current) return;

    // Direction
    const dir = getDirection();
    setDirection(dir);

    // Coords
    const rect = triggerRef.current.getBoundingClientRect();
    setCoords({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      bottom: rect.bottom,
    });
  }, [getDirection, triggerRef]);

  const toggle = useCallback(() => {
    if (!isOpen) {
      // Opening
      calculatePosition();
      setIsOpen(true);
    } else {
      // Closing
      setIsOpen(false);
    }
  }, [isOpen, calculatePosition, setIsOpen]);

  const close = useCallback(() => {
    if (isOpen) setIsOpen(false);
  }, [isOpen, setIsOpen]);

  // Click Outside (Check both Trigger and Content)
  useOutsideClick([triggerRef, contentRef] as unknown as RefObject<HTMLElement>[], close, isOpen);

  // Scroll & Resize Handling
  useEffect(() => {
    if (!isOpen) return;

    const handleScroll = (event: Event) => {
      // If scroll happening inside contentRef, ignore
      if (
        contentRef.current &&
        event.target instanceof Node &&
        contentRef.current.contains(event.target)
      ) {
        return;
      }

      if (closeOnScroll) {
        // Skip close during programmatic scrolls (e.g., auto-scroll to active subtitle)
        if (!isProgrammaticScroll()) {
          setIsOpen(false);
        }
      } else if (recalculateOnScroll) {
        calculatePosition();
      }
    };

    // Stable reference for resize handler to ensure proper cleanup
    const handleResize = () => {
      setIsOpen(false);
    };

    // Use passive: true to avoid blocking scroll thread
    window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('scroll', handleScroll, { capture: true });
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen, closeOnScroll, recalculateOnScroll, calculatePosition, setIsOpen]);

  return {
    isOpen,
    setIsOpen,
    toggle,
    close,
    triggerRef,
    contentRef,
    coords,
    direction,
    recalculatePosition: calculatePosition,
  };
}
