import React from 'react';
import { cn } from '@/lib/cn';

/** 步骤指示器 */
export function StepIndicator({
  currentStep,
  steps,
}: {
  currentStep: number;
  steps: { label: string; icon: React.ReactNode }[];
}) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {steps.map((step, index) => (
        <React.Fragment key={index}>
          <div
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-full transition-all',
              index < currentStep &&
                'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
              index === currentStep &&
                'bg-violet-500/20 text-violet-300 border border-violet-500/50',
              index > currentStep && 'bg-white/5 text-white/40 border border-white/10'
            )}
          >
            <span className="w-5 h-5">{step.icon}</span>
            <span className="text-sm font-medium hidden sm:inline">{step.label}</span>
          </div>
          {index < steps.length - 1 && (
            <div
              className={cn('w-8 h-0.5', index < currentStep ? 'bg-emerald-500/50' : 'bg-white/10')}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
