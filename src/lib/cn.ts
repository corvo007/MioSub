import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility function for constructing className strings conditionally.
 * Combines clsx for conditional logic with tailwind-merge for conflict resolution.
 */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
