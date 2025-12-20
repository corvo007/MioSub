import { useState, useEffect } from 'react';
import type { HardwareAccelInfo } from '@/types/compression';

export function useHardwareAcceleration() {
  const [hwAccelInfo, setHwAccelInfo] = useState<HardwareAccelInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchHwAccelInfo = async () => {
      // Check sessionStorage cache first (cleared on app restart)
      const cached = sessionStorage.getItem('hwAccelInfo');
      if (cached) {
        try {
          const info = JSON.parse(cached) as HardwareAccelInfo;
          setHwAccelInfo(info);
          setIsLoading(false);
          return;
        } catch {
          sessionStorage.removeItem('hwAccelInfo');
        }
      }

      // Fetch from backend if not cached
      if (window.electronAPI?.compression?.getHwAccelInfo) {
        try {
          const info = await window.electronAPI.compression.getHwAccelInfo();
          setHwAccelInfo(info);
          // Cache to sessionStorage
          sessionStorage.setItem('hwAccelInfo', JSON.stringify(info));
        } catch (error) {
          console.error(
            '[useHardwareAcceleration] Failed to get hardware acceleration info:',
            error
          );
        }
      }
      setIsLoading(false);
    };

    void fetchHwAccelInfo();
  }, []);

  return { hwAccelInfo, isLoading };
}
