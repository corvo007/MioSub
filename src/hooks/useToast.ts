import { useState, useCallback } from 'react';
import type { ToastMessage } from '@/components/ui';

/**
 * Custom hook for managing toast notifications
 * Automatically removes toasts after 5 seconds
 */
export const useToast = () => {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    const addToast = useCallback((
        message: string,
        type: 'info' | 'warning' | 'error' | 'success' = 'info'
    ) => {
        const id = Date.now().toString() + Math.random().toString();
        setToasts(prev => [...prev, { id, message, type }]);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 5000);
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return { toasts, addToast, removeToast };
};
