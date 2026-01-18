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
              'flex items-center gap-2 px-4 py-2 rounded-full transition-all border shadow-sm',
              index < currentStep && 'bg-emerald-50 text-emerald-600 border-emerald-200',
              index === currentStep &&
                'bg-brand-purple/10 text-brand-purple border-brand-purple/20 ring-2 ring-brand-purple/5',
              index > currentStep && 'bg-white text-slate-400 border-slate-200'
            )}
          >
            <span className="w-5 h-5">{step.icon}</span>
            <span className="text-sm font-medium hidden sm:inline">{step.label}</span>
          </div>
          {index < steps.length - 1 && (
            <div
              className={cn('w-8 h-0.5', index < currentStep ? 'bg-emerald-500' : 'bg-slate-300')}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
