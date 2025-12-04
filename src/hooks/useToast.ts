import { useState, useCallback, useEffect, useRef } from 'react';
import type { ToastMessage } from '@/components/ui';

/**
 * Custom hook for managing toast notifications
 * Automatically removes toasts after specified duration
 */
export const useToast = () => {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

    // Cleanup all timers on unmount
    useEffect(() => {
        return () => {
            timersRef.current.forEach(timer => clearTimeout(timer));
            timersRef.current.clear();
        };
    }, []);

    const addToast = useCallback((
        message: string,
        type: 'info' | 'warning' | 'error' | 'success' = 'info',
        duration: number = 5000
    ) => {
        const id = Date.now().toString() + Math.random().toString();
        setToasts(prev => [...prev, { id, message, type }]);

        // Auto-remove after duration with cleanup tracking
        const timer = setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
            timersRef.current.delete(id);
        }, duration);

        timersRef.current.set(id, timer);
    }, []);

    const removeToast = useCallback((id: string) => {
        // Clear and remove the timer
        const timer = timersRef.current.get(id);
        if (timer) {
            clearTimeout(timer);
            timersRef.current.delete(id);
        }
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return { toasts, addToast, removeToast };
};
