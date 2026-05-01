/**
 * components/HelpPanel.tsx
 *
 * Contextual help panel that slides in from the right.
 * Shows per-page tips, shortcuts, and a "restart tour" button.
 *
 * Usage: Drop <HelpPanel /> once in your root layout alongside <TourOverlay />.
 * Triggered by useTour().toggleHelp() — wire it to a ? button in your sidebar/navbar.
 */

import { useEffect, useRef } from 'react';
import { useTour, PAGE_HELP } from '@/contexts/TourContext';
import { X, Lightbulb, Keyboard, PlayCircle, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function HelpPanel() {
  const { isHelpOpen, closeHelp, currentPage, startTour, resetTour } = useTour();
  const panelRef = useRef<HTMLDivElement>(null);

  const help = PAGE_HELP[currentPage];

  // Close on Escape
  useEffect(() => {
    if (!isHelpOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeHelp();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isHelpOpen, closeHelp]);

  // Trap focus within panel
  useEffect(() => {
    if (isHelpOpen) panelRef.current?.focus();
  }, [isHelpOpen]);

  if (!isHelpOpen) return null;

  return (
    <>
      {/* Backdrop (click to close) */}
      <div
        className="fixed inset-0 z-[9990] bg-black/30 backdrop-blur-[1px] animate-in fade-in duration-150"
        onClick={closeHelp}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        role="complementary"
        aria-label="Help panel"
        className="fixed right-0 top-0 bottom-0 z-[9991] w-80 bg-card border-l border-border shadow-2xl animate-in slide-in-from-right duration-200 flex flex-col focus:outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <HelpCircle className="h-4 w-4 text-primary" />
            </div>
            <h2 className="font-semibold text-foreground">Help</h2>
          </div>
          <button
            onClick={closeHelp}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Close help"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

          {/* Page context */}
          {help ? (
            <>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">{help.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{help.description}</p>
              </div>

              {/* Tips */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Tips</span>
                </div>
                <ul className="space-y-2.5">
                  {help.tips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="h-4 w-4 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <p className="text-xs text-muted-foreground leading-relaxed">{tip}</p>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Keyboard shortcuts */}
              {help.shortcuts && help.shortcuts.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Keyboard className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Shortcuts</span>
                  </div>
                  <div className="space-y-2">
                    {help.shortcuts.map((sc, i) => (
                      <div key={i} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">{sc.action}</span>
                        <kbd className="text-[10px] font-mono font-semibold bg-muted text-foreground rounded px-1.5 py-0.5 border border-border">
                          {sc.key}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <HelpCircle className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No contextual help for this page yet.</p>
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Tour restart */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">Guided Tour</p>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2 h-9 text-xs"
              onClick={() => { closeHelp(); resetTour(); }}
            >
              <PlayCircle className="h-4 w-4 text-primary" />
              Restart onboarding tour
            </Button>
            <p className="text-[10px] text-muted-foreground">
              Takes ~2 minutes. Covers all major features.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border shrink-0">
          <p className="text-[10px] text-muted-foreground text-center">
            Z IT Solutions CRM · Press <kbd className="font-mono bg-muted px-1 rounded">Esc</kbd> to close
          </p>
        </div>
      </div>
    </>
  );
}