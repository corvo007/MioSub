import { useState, useEffect } from 'react';
import type { HardwareAccelInfo } from '@/types/compression';
import { logger } from '@/services/utils/logger';

export function useHardwareAcceleration() {
  const [hwAccelInfo, setHwAccelInfo] = useState<HardwareAccelInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchHwAccelInfo = async () => {
      const cached = sessionStorage.getItem('hwAccelInfo');
      if (cached) {
        try {
          const info = JSON.parse(cached) as HardwareAccelInfo;
          if (!cancelled) {
            setHwAccelInfo(info);
            setIsLoading(false);
          }
          return;
        } catch {
          sessionStorage.removeItem('hwAccelInfo');
        }
      }

      if (window.electronAPI?.compression?.getHwAccelInfo) {
        try {
          const info = await window.electronAPI.compression.getHwAccelInfo();
          if (!cancelled) {
            setHwAccelInfo(info);
            sessionStorage.setItem('hwAccelInfo', JSON.stringify(info));
          }
        } catch (error) {
          logger.error('[useHardwareAcceleration] Failed to get hardware acceleration info', error);
        }
      }
      if (!cancelled) setIsLoading(false);
    };

    void fetchHwAccelInfo();
    return () => {
      cancelled = true;
    };
  }, []);

  return { hwAccelInfo, isLoading };
}
