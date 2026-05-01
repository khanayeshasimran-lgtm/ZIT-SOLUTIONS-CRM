/**
 * components/TourOverlay.tsx
 *
 * Renders the guided tour modal overlay.
 * Wired to TourContext — no local state, everything from useTour().
 *
 * Usage: Drop <TourOverlay /> once in your root layout (e.g. AppLayout.tsx).
 * It self-shows/hides based on isTourActive from context.
 */

import { useEffect, useRef } from 'react';
import { useTour } from '@/contexts/TourContext';
import { X, ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function TourOverlay() {
  const {
    isTourActive,
    currentStep,
    totalSteps,
    currentTourStep,
    nextStep,
    prevStep,
    skipTour,
  } = useTour();

  const overlayRef = useRef<HTMLDivElement>(null);

  // Lock body scroll when tour is active
  useEffect(() => {
    if (isTourActive) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isTourActive]);

  if (!isTourActive || !currentTourStep) return null;

  const isCenter = currentTourStep.placement === 'center';
  const isFirst  = currentStep === 0;
  const isLast   = currentStep === totalSteps - 1;
  const progress = Math.round(((currentStep + 1) / totalSteps) * 100);

  return (
    <>
      {/* Backdrop */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-200"
        onClick={skipTour}
        aria-hidden="true"
      />

      {/* Tour card — always centered for simplicity and reliability */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={currentTourStep.title}
        className="fixed z-[9999] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-card border border-border/60 rounded-2xl shadow-2xl overflow-hidden">

          {/* Progress bar */}
          <div className="h-1 bg-muted w-full">
            <div
              className="h-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Header */}
          <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-1">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </div>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Step {currentStep + 1} of {totalSteps}
              </span>
            </div>
            <button
              onClick={skipTour}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Skip tour"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-4">
            <h2 className="text-lg font-semibold text-foreground mb-2 leading-snug">
              {currentTourStep.title}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {currentTourStep.description}
            </p>
          </div>

          {/* Step dots */}
          <div className="flex items-center justify-center gap-1.5 pb-2">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`rounded-full transition-all duration-200 ${
                  i === currentStep
                    ? 'h-1.5 w-4 bg-primary'
                    : i < currentStep
                    ? 'h-1.5 w-1.5 bg-primary/40'
                    : 'h-1.5 w-1.5 bg-muted-foreground/25'
                }`}
              />
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-6 pb-5 pt-2">
            <button
              onClick={skipTour}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip tour
            </button>

            <div className="flex items-center gap-2">
              {!isFirst && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={prevStep}
                  className="h-8 px-3 text-xs gap-1.5"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back
                </Button>
              )}
              <Button
                size="sm"
                onClick={nextStep}
                className="h-8 px-4 text-xs gap-1.5"
              >
                {isLast ? 'Finish' : 'Next'}
                {!isLast && <ArrowRight className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </div>

        {/* Keyboard hint */}
        <p className="text-center text-[10px] text-white/50 mt-2">
          ← → arrow keys to navigate · Esc to skip
        </p>
      </div>
    </>
  );
}