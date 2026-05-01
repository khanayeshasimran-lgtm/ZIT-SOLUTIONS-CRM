/**
 * components/HelpButton.tsx
 *
 * A floating circular ? button that opens the HelpPanel.
 * Drop it once anywhere in your layout — it positions itself fixed bottom-right.
 *
 * Also exports <Tooltip> — a lightweight wrapper for inline contextual tooltips.
 *
 * Usage in layout:
 *   import { HelpButton } from '@/components/HelpButton';
 *   <HelpButton />
 *
 * Usage for inline tooltips:
 *   import { Tooltip } from '@/components/HelpButton';
 *   <Tooltip content="This field is required">
 *     <InfoIcon className="h-4 w-4" />
 *   </Tooltip>
 */

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { useTour } from '@/contexts/TourContext';
import { HelpCircle } from 'lucide-react';

// ── Floating help button ──────────────────────────────────────────────────────

export function HelpButton() {
  const { toggleHelp, isHelpOpen } = useTour();

  return (
    <button
      onClick={toggleHelp}
      aria-label="Open help panel"
      aria-pressed={isHelpOpen}
      className={`
        fixed bottom-6 right-6 z-[9980]
        h-10 w-10 rounded-full shadow-lg border border-border
        flex items-center justify-center
        transition-all duration-200
        ${isHelpOpen
          ? 'bg-primary text-primary-foreground scale-110'
          : 'bg-card text-muted-foreground hover:text-foreground hover:scale-105 hover:shadow-xl'
        }
      `}
    >
      <HelpCircle className="h-5 w-5" />
    </button>
  );
}

// ── Sidebar help link (for use inside your sidebar nav) ───────────────────────

export function SidebarHelpLink() {
  const { toggleHelp } = useTour();
  return (
    <button
      onClick={toggleHelp}
      data-tour="settings-link"
      className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
    >
      <HelpCircle className="h-4 w-4 shrink-0" />
      <span>Help & Tour</span>
    </button>
  );
}

// ── Inline tooltip wrapper ────────────────────────────────────────────────────

interface TooltipProps {
  content: string;
  children: ReactNode;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

export function Tooltip({ content, children, placement = 'top', delay = 300 }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef  = useRef<HTMLDivElement>(null);

  const show = () => {
    timerRef.current = setTimeout(() => setVisible(true), delay);
  };

  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const placementClasses: Record<string, string> = {
    top:    'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full  left-1/2 -translate-x-1/2 mt-2',
    left:   'right-full top-1/2 -translate-y-1/2 mr-2',
    right:  'left-full  top-1/2 -translate-y-1/2 ml-2',
  };

  const arrowClasses: Record<string, string> = {
    top:    'top-full  left-1/2 -translate-x-1/2 border-t-slate-800 border-t-4 border-x-4 border-x-transparent border-b-0',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-slate-800 border-b-4 border-x-4 border-x-transparent border-t-0',
    left:   'left-full  top-1/2 -translate-y-1/2 border-l-slate-800 border-l-4 border-y-4 border-y-transparent border-r-0',
    right:  'right-full top-1/2 -translate-y-1/2 border-r-slate-800 border-r-4 border-y-4 border-y-transparent border-l-0',
  };

  return (
    <div
      ref={wrapRef}
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && (
        <div
          role="tooltip"
          className={`
            absolute z-[9970] pointer-events-none
            ${placementClasses[placement]}
            animate-in fade-in zoom-in-95 duration-100
          `}
        >
          <div className="bg-slate-800 dark:bg-slate-700 text-white text-xs font-medium rounded-lg px-2.5 py-1.5 max-w-[220px] text-center leading-relaxed shadow-xl whitespace-nowrap">
            {content}
          </div>
          {/* Arrow */}
          <div className={`absolute w-0 h-0 ${arrowClasses[placement]}`} />
        </div>
      )}
    </div>
  );
}