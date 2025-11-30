import { useState, useCallback } from 'react';
import { SubtitleSnapshot, SubtitleItem } from '@/types/subtitle';

/**
 * Custom hook for managing subtitle snapshots (history)
 * Maintains up to 20 snapshots for version control
 */
export const useSnapshots = () => {
    const [snapshots, setSnapshots] = useState<SubtitleSnapshot[]>([]);

    const createSnapshot = useCallback((
        description: string,
        subtitles: SubtitleItem[],
        batchComments: Record<number, string>
    ) => {
        const newSnapshot: SubtitleSnapshot = {
            id: Date.now().toString(),
            timestamp: new Date().toLocaleTimeString(),
            description,
            subtitles: JSON.parse(JSON.stringify(subtitles)),
            batchComments: { ...batchComments }
        };
        // Keep最多20个快照
        setSnapshots(prev => [newSnapshot, ...prev].slice(0, 20));
    }, []);

    const clearSnapshots = useCallback(() => {
        setSnapshots([]);
    }, []);

    return {
        snapshots,
        createSnapshot,
        clearSnapshots,
        setSnapshots
    };
};
