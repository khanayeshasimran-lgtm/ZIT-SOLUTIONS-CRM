/**
 * src/hooks/useEmailSuggestion.ts
 *
 * React hook that manages email suggestion state.
 * Handles loading, error, selection, and clipboard copy.
 *
 * Usage:
 *   const { suggestions, loading, error, fetch, selected, select, copied, copy } =
 *     useEmailSuggestion();
 *
 *   // Trigger generation
 *   await fetch({ lead_id: 'uuid', goal: 'follow_up' });
 *
 *   // Copy selected email to clipboard
 *   copy(suggestions[0]);
 */

import { useState, useCallback } from 'react';
import {
  suggestEmail,
  EmailSuggestion,
  EmailGoal,
  EmailTone,
} from '@/services/ai.service';
import { useToast } from '@/hooks/use-toast';

interface UseEmailSuggestionReturn {
  suggestions:  EmailSuggestion[];
  loading:      boolean;
  error:        string | null;
  cached:       boolean;
  contextUsed:  { name: string; stage?: string | null; source?: string | null; days_since_contact?: number | null } | null;
  fetch: (params: {
    lead_id?: string;
    deal_id?: string;
    tone?:    EmailTone;
    goal?:    EmailGoal;
  }) => Promise<void>;
  selected:     number;
  select:       (index: number) => void;
  copied:       boolean;
  copy:         (suggestion: EmailSuggestion) => void;
  reset:        () => void;
}

export function useEmailSuggestion(): UseEmailSuggestionReturn {
  const { toast } = useToast();

  const [suggestions,  setSuggestions]  = useState<EmailSuggestion[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [cached,       setCached]       = useState(false);
  const [contextUsed,  setContextUsed]  = useState<UseEmailSuggestionReturn['contextUsed']>(null);
  const [selected,     setSelected]     = useState(0);
  const [copied,       setCopied]       = useState(false);

  const fetch = useCallback(async (params: Parameters<typeof suggestEmail>[0]) => {
    setLoading(true);
    setError(null);
    setSuggestions([]);
    setSelected(0);

    try {
      const result = await suggestEmail(params);
      setSuggestions(result.data.suggestions);
      setContextUsed(result.data.context_used);
      setCached(result.cached);

      if (result.cached) {
        toast({ title: 'Loaded from cache', description: 'Suggestions are from a recent generation for this contact.' });
      }
    } catch (err: any) {
      const msg = err?.message ?? 'Failed to generate suggestions';

      // Surface rate limit errors clearly
      if (msg.includes('Rate limit')) {
        setError('You\'ve used your email suggestion quota for this hour. Try again in 60 minutes.');
      } else {
        setError(msg);
      }

      toast({ variant: 'destructive', title: 'AI Error', description: msg.slice(0, 100) });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const select = useCallback((index: number) => {
    setSelected(index);
    setCopied(false);
  }, []);

  const copy = useCallback((suggestion: EmailSuggestion) => {
    const text = `Subject: ${suggestion.subject}\n\n${suggestion.body}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast({ title: 'Copied to clipboard ✓' });
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      toast({ variant: 'destructive', title: 'Copy failed', description: 'Please copy manually.' });
    });
  }, [toast]);

  const reset = useCallback(() => {
    setSuggestions([]);
    setError(null);
    setCached(false);
    setContextUsed(null);
    setSelected(0);
    setCopied(false);
  }, []);

  return {
    suggestions, loading, error, cached, contextUsed,
    fetch, selected, select, copied, copy, reset,
  };
}