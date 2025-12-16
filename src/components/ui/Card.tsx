import React from 'react';
import { cn } from '@/lib/cn';

interface CardProps {
  children: React.ReactNode;
  title?: string;
  icon?: React.ReactNode;
  className?: string;
  variant?: 'default' | 'interactive';
  onClick?: () => void;
  padding?: 'none' | 'sm' | 'md';
}

const paddingClasses = {
  none: '',
  sm: 'p-3',
  md: 'p-4 md:p-6',
};

/**
 * A card container with optional icon and title header.
 * Supports interactive variant with hover effect.
 */
export const Card: React.FC<CardProps> = ({
  children,
  title,
  icon,
  className = '',
  variant = 'default',
  onClick,
  padding = 'md',
}) => {
  return (
    <div
      className={cn(
        'bg-white/5 border border-white/10 rounded-xl',
        paddingClasses[padding],
        variant === 'interactive' && 'cursor-pointer transition-colors hover:bg-white/8',
        className
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {title && (
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/10">
          {icon && <span className="text-violet-400">{icon}</span>}
          <h3 className="font-medium text-white">{title}</h3>
        </div>
      )}
      {children}
    </div>
  );
};
