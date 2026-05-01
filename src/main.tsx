/**
 * src/main.tsx
 *
 * DAY 1 FIX: Removed AuthProvider and OrganizationProvider wrappers.
 * They already live inside App.tsx → having them here created two separate
 * React context trees: double Supabase subscriptions, potential auth state
 * conflicts, and wasted renders on every context update.
 *
 * Rule: providers live in ONE place only — App.tsx owns them.
 *
 * Sentry must be initialised BEFORE React renders so the very first
 * render is already instrumented.
 */

import { initSentry } from '@/lib/sentry';
initSentry(); // ← first line of execution

import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);