/**
 * contexts/TourContext.tsx
 *
 * Global guided tour + tooltip system for Z IT Solutions CRM.
 *
 * Features:
 *   - First-time onboarding tour (step-by-step walkthrough)
 *   - Persistent tooltip system for every major UI element
 *   - Per-page contextual help panels
 *   - Tour completion stored in localStorage per user
 *   - Keyboard navigation (Escape to close, Arrow keys to navigate)
 */

import {
  createContext, useContext, useEffect, useState, useCallback, useRef,
  type ReactNode,
} from 'react';

// ── Tour step definition ──────────────────────────────────────────────────────

export interface TourStep {
  id: string;
  target: string;           // CSS selector for the element to highlight
  title: string;
  description: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  page?: string;            // route path this step belongs to
  action?: string;          // optional CTA label
  spotlight?: boolean;      // dim everything else
}

// ── Tooltip definition ────────────────────────────────────────────────────────

export interface TooltipDef {
  id: string;
  content: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

// ── Page help ─────────────────────────────────────────────────────────────────

export interface PageHelp {
  title: string;
  description: string;
  tips: string[];
  shortcuts?: { key: string; action: string }[];
}

export const PAGE_HELP: Record<string, PageHelp> = {
  '/dashboard': {
    title: 'Dashboard',
    description: 'Your command center — a real-time overview of your entire business.',
    tips: [
      'KPI cards update live as you add leads and close deals.',
      'The pipeline chart shows deal distribution across all stages.',
      'Idle leads (no contact in 3+ days) are flagged automatically.',
      'Pinned notices appear here for team-wide announcements.',
    ],
    shortcuts: [
      { key: 'D', action: 'Jump to Dashboard' },
      { key: 'L', action: 'Jump to Leads' },
      { key: 'P', action: 'Jump to Pipeline' },
    ],
  },
  '/leads': {
    title: 'Leads',
    description: 'Track every potential customer from first contact to conversion.',
    tips: [
      'AI scores each lead 0–100 based on source, activity, and deal history.',
      'Hot leads (70+) are your highest priority — act on them first.',
      'Use the import button to bulk-upload leads from a CSV file.',
      'Star important leads to pin them to the top of your list.',
    ],
  },
  '/pipeline': {
    title: 'Pipeline',
    description: 'Visual kanban board to manage deals through every stage.',
    tips: [
      'Drag and drop cards to move deals between stages.',
      'Each stage shows total deal value and count.',
      'Won deals trigger an automatic success notification.',
      'Weighted forecast = deal value × win probability per stage.',
    ],
  },
  '/contacts': {
    title: 'Contacts',
    description: 'Your full contact database — individuals linked to companies and deals.',
    tips: [
      'Contacts can be linked to companies, leads, and deals.',
      'Filter by company to find all contacts at an organization.',
      'Export contacts to CSV/Excel for use in external tools.',
    ],
  },
  '/companies': {
    title: 'Companies',
    description: 'Track organizations, their contacts, and relationship history.',
    tips: [
      'Each company can have multiple contacts and deals.',
      'Industry tagging helps with segmentation and reporting.',
    ],
  },
  '/activities': {
    title: 'Activities',
    description: 'Log calls, emails, meetings, and follow-ups linked to leads or deals.',
    tips: [
      'Overdue activities are highlighted in red automatically.',
      'Completing a meeting activity syncs with your Meetings calendar.',
      'Set due dates to keep your follow-up cadence on track.',
    ],
  },
  '/meetings': {
    title: 'Meetings',
    description: 'Schedule and track all client and team meetings.',
    tips: [
      'Virtual meetings auto-generate a video link field.',
      'Meetings linked to deals update the deal activity timeline.',
      'The countdown timer on Dashboard shows your next upcoming meeting.',
    ],
  },
  '/tickets': {
    title: 'Support Tickets',
    description: 'Track and resolve customer support issues end-to-end.',
    tips: [
      'Urgent tickets send an automatic email notification.',
      'Link tickets to leads, contacts, or companies for context.',
      'GitHub issue URLs can be attached to technical tickets.',
      'Resolve tickets with one click — status toggles automatically.',
    ],
  },
  '/invoices': {
    title: 'Invoices',
    description: 'Create, send, and track payment status for all your invoices.',
    tips: [
      'Overdue invoices are flagged and trigger payment reminder notifications.',
      'Export invoices to PDF for sending to clients directly.',
    ],
  },
  '/projects': {
    title: 'Projects',
    description: 'Manage client and internal projects with tasks and milestones.',
    tips: [
      'Link projects to companies or contacts for full context.',
      'Sprint Board shows all tasks in a kanban view.',
    ],
  },
  '/analytics': {
    title: 'Analytics',
    description: 'Deep-dive into revenue, conversion rates, and team performance.',
    tips: [
      'Date filters let you compare performance across any time period.',
      'Win rate is calculated only on closed (won + lost) deals.',
      'Export charts as PNG or data as CSV for reporting.',
    ],
  },
  '/settings': {
    title: 'Settings',
    description: 'Manage your profile, role, and notification preferences.',
    tips: [
      'Notification preferences are saved per user — not global.',
      'Your role is shown here but can only be changed by an Admin.',
      'Email notifications require SendGrid to be connected in Integrations.',
    ],
  },
  '/interns': {
    title: 'Interns',
    description: 'Track intern assignments, domains, and progress.',
    tips: [
      'Each intern has a domain, status, and start/end date.',
      'Completed interns are automatically archived from the active view.',
    ],
  },
  '/users': {
    title: 'User Management',
    description: 'Manage team members and assign roles. Admin only.',
    tips: [
      'You cannot change your own role — ask another admin.',
      'Roles: Admin (full access), Manager (teams & projects), User (standard), Investor (read-only).',
    ],
  },
  '/audit-logs': {
    title: 'Audit Logs',
    description: 'Full audit trail of every action taken in the CRM. Admin only.',
    tips: [
      'Use date range filters to investigate specific incidents.',
      'Export logs to PDF for compliance reporting.',
      'Clicking a row expands full details including the entity ID.',
    ],
  },
};

// ── Tour steps ────────────────────────────────────────────────────────────────

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    target: 'body',
    title: 'Welcome to Z IT Solutions CRM 👋',
    description: "This quick tour will show you the key features in under 2 minutes. You can skip at any time and restart it from the Help menu.",
    placement: 'center',
    spotlight: false,
  },
  {
    id: 'sidebar-nav',
    target: '[data-tour="sidebar"]',
    title: 'Navigation Sidebar',
    description: 'Everything is organized here — Leads, Pipeline, Contacts, Projects, and more. Your role determines which sections you can access.',
    placement: 'right',
    spotlight: true,
  },
  {
    id: 'dashboard-kpis',
    target: '[data-tour="kpi-cards"]',
    title: 'Live KPI Cards',
    description: 'Revenue, active deals, new leads, and win rate — updated in real time as your team works.',
    placement: 'bottom',
    spotlight: true,
    page: '/dashboard',
  },
  {
    id: 'leads-table',
    target: '[data-tour="leads-table"]',
    title: 'Lead Management',
    description: 'Every lead is scored 0–100 by AI based on source, engagement, and deal history. Hot leads (70+) need your attention first.',
    placement: 'top',
    spotlight: true,
    page: '/leads',
  },
  {
    id: 'pipeline-board',
    target: '[data-tour="pipeline-board"]',
    title: 'Visual Pipeline',
    description: 'Drag cards between stages to update deals. The weighted forecast at the top shows expected revenue accounting for win probability.',
    placement: 'top',
    spotlight: true,
    page: '/pipeline',
  },
  {
    id: 'add-button',
    target: '[data-tour="add-btn"]',
    title: 'Add Anything',
    description: 'Every page has a primary action button in the top right. Use it to add leads, deals, contacts, tickets, and more.',
    placement: 'left',
    spotlight: true,
  },
  {
    id: 'export',
    target: '[data-tour="export-btn"]',
    title: 'Export Your Data',
    description: 'Export any table to CSV, Excel, or PDF with one click. PDFs include your company branding automatically.',
    placement: 'left',
    spotlight: true,
  },
  {
    id: 'settings-nav',
    target: '[data-tour="settings-link"]',
    title: 'Your Profile & Settings',
    description: 'Update your profile, set notification preferences, and see your role and permissions here.',
    placement: 'right',
    spotlight: true,
  },
  {
    id: 'done',
    target: 'body',
    title: "You're all set! 🚀",
    description: 'The tour is complete. You can relaunch it anytime from the ? Help button. Every page also has a Help panel with tips and keyboard shortcuts.',
    placement: 'center',
    spotlight: false,
  },
];

// ── Context type ──────────────────────────────────────────────────────────────

interface TourContextValue {
  // Tour state
  isTourActive: boolean;
  currentStep: number;
  totalSteps: number;
  currentTourStep: TourStep | null;
  startTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTour: () => void;
  completeTour: () => void;

  // Help panel
  isHelpOpen: boolean;
  currentPage: string;
  setCurrentPage: (path: string) => void;
  toggleHelp: () => void;
  closeHelp: () => void;

  // Tooltip registry
  registerTooltip: (id: string, def: TooltipDef) => void;
  activeTooltip: string | null;
  showTooltip: (id: string) => void;
  hideTooltip: () => void;

  // Tour completion
  hasCompletedTour: boolean;
  resetTour: () => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const TourContext = createContext<TourContextValue | null>(null);

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used inside TourProvider');
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'zit_crm_tour_completed';

export function TourProvider({ children }: { children: ReactNode }) {
  const [isTourActive, setIsTourActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState('/dashboard');
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [hasCompletedTour, setHasCompletedTour] = useState(
    () => localStorage.getItem(STORAGE_KEY) === 'true'
  );
  const tooltipRegistry = useRef<Map<string, TooltipDef>>(new Map());

  const totalSteps = TOUR_STEPS.length;
  const currentTourStep = isTourActive ? TOUR_STEPS[currentStep] : null;

  // Auto-start tour for new users
  useEffect(() => {
    if (!hasCompletedTour) {
      const timer = setTimeout(() => setIsTourActive(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [hasCompletedTour]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!isTourActive) return;
      if (e.key === 'Escape') skipTour();
      if (e.key === 'ArrowRight') nextStep();
      if (e.key === 'ArrowLeft') prevStep();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isTourActive, currentStep]);

  const startTour = useCallback(() => {
    setCurrentStep(0);
    setIsTourActive(true);
    setIsHelpOpen(false);
  }, []);

  const nextStep = useCallback(() => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(s => s + 1);
    } else {
      completeTour();
    }
  }, [currentStep, totalSteps]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) setCurrentStep(s => s - 1);
  }, [currentStep]);

  const skipTour = useCallback(() => {
    setIsTourActive(false);
    localStorage.setItem(STORAGE_KEY, 'true');
    setHasCompletedTour(true);
  }, []);

  const completeTour = useCallback(() => {
    setIsTourActive(false);
    localStorage.setItem(STORAGE_KEY, 'true');
    setHasCompletedTour(true);
  }, []);

  const resetTour = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setHasCompletedTour(false);
    setCurrentStep(0);
    setIsTourActive(true);
  }, []);

  const toggleHelp = useCallback(() => setIsHelpOpen(v => !v), []);
  const closeHelp = useCallback(() => setIsHelpOpen(false), []);

  const registerTooltip = useCallback((id: string, def: TooltipDef) => {
    tooltipRegistry.current.set(id, def);
  }, []);

  const showTooltip = useCallback((id: string) => {
    setActiveTooltip(id);
  }, []);

  const hideTooltip = useCallback(() => {
    setActiveTooltip(null);
  }, []);

  return (
    <TourContext.Provider value={{
      isTourActive, currentStep, totalSteps, currentTourStep,
      startTour, nextStep, prevStep, skipTour, completeTour,
      isHelpOpen, currentPage, setCurrentPage, toggleHelp, closeHelp,
      registerTooltip, activeTooltip, showTooltip, hideTooltip,
      hasCompletedTour, resetTour,
    }}>
      {children}
    </TourContext.Provider>
  );
}