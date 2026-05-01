/**
 * src/components/ai/EmailSuggestionPanel.tsx
 *
 * Drop-in AI email suggestion panel.
 * Add to Leads page (lead detail) or Pipeline (deal card expanded view).
 *
 * Usage in Leads.tsx:
 *   <EmailSuggestionPanel leadId={lead.id} />
 *
 * Usage in Pipeline.tsx:
 *   <EmailSuggestionPanel dealId={deal.id} defaultGoal="proposal" />
 */

import { useState } from 'react';
import { useEmailSuggestion } from '@/hooks/useEmailSuggestion';
import { EmailGoal, EmailTone } from '@/services/ai.service';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Sparkles, Copy, Check, RefreshCw, ChevronDown, ChevronUp,
  Clock, Zap,
} from 'lucide-react';

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  leadId?:     string;
  dealId?:     string;
  defaultGoal?: EmailGoal;
  defaultTone?: EmailTone;
  /** If true, renders as a collapsible panel. Default: false (always open) */
  collapsible?: boolean;
}

// ── Config ────────────────────────────────────────────────────────────────────

const GOAL_OPTIONS: { value: EmailGoal; label: string }[] = [
  { value: 'follow_up',       label: 'Follow up'       },
  { value: 'introduction',    label: 'Introduction'    },
  { value: 'proposal',        label: 'Send proposal'   },
  { value: 'check_in',        label: 'Check in'        },
  { value: 'win_back',        label: 'Win back'        },
  { value: 'meeting_request', label: 'Request meeting' },
];

const TONE_OPTIONS: { value: EmailTone; label: string }[] = [
  { value: 'professional', label: 'Professional' },
  { value: 'friendly',     label: 'Friendly'     },
  { value: 'urgent',       label: 'Urgent'       },
  { value: 'follow_up',    label: 'Follow-up'    },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function EmailSuggestionPanel({
  leadId,
  dealId,
  defaultGoal = 'follow_up',
  defaultTone = 'professional',
  collapsible = false,
}: Props) {
  const {
    suggestions, loading, error, cached, contextUsed,
    fetch, selected, select, copied, copy, reset,
  } = useEmailSuggestion();

  const [goal,      setGoal]      = useState<EmailGoal>(defaultGoal);
  const [tone,      setTone]      = useState<EmailTone>(defaultTone);
  const [expanded,  setExpanded]  = useState(!collapsible);

  const handleGenerate = () => {
    fetch({ lead_id: leadId, deal_id: dealId, tone, goal });
  };

  const handleRegenerate = () => {
    reset();
    fetch({ lead_id: leadId, deal_id: dealId, tone, goal });
  };

  const currentSuggestion = suggestions[selected] ?? null;

  // Collapsible header
  if (collapsible && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 transition-colors text-sm font-semibold text-indigo-700"
      >
        <Sparkles className="h-4 w-4" />
        AI Email Suggestions
        <ChevronDown className="h-3.5 w-3.5 ml-auto" />
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-indigo-200/60 bg-gradient-to-br from-indigo-50/50 to-violet-50/30 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-indigo-100">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-500" />
          <span className="text-sm font-bold text-indigo-800">AI Email Suggestions</span>
          {cached && (
            <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600">
              <Clock className="h-2.5 w-2.5" />cached
            </span>
          )}
        </div>
        {collapsible && (
          <button
            onClick={() => setExpanded(false)}
            className="text-indigo-400 hover:text-indigo-600"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">

        {/* Context chip */}
        {contextUsed && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-indigo-600 font-semibold">
              Context:
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-indigo-100 text-indigo-700 font-medium">
              {contextUsed.name}
            </span>
            {contextUsed.stage && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-indigo-100 text-indigo-700 font-medium">
                {contextUsed.stage}
              </span>
            )}
            {contextUsed.days_since_contact != null && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 border border-amber-100 text-amber-700 font-medium">
                {contextUsed.days_since_contact}d since contact
              </span>
            )}
          </div>
        )}

        {/* Controls */}
        {suggestions.length === 0 && !loading && (
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Goal</label>
              <Select value={goal} onValueChange={v => setGoal(v as EmailGoal)}>
                <SelectTrigger className="h-8 text-xs w-40 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GOAL_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Tone</label>
              <Select value={tone} onValueChange={v => setTone(v as EmailTone)}>
                <SelectTrigger className="h-8 text-xs w-36 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={loading}
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 text-white h-8 gap-1.5"
            >
              {loading
                ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Generating…</>
                : <><Zap className="h-3.5 w-3.5" />Generate</>
              }
            </Button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3 animate-pulse">
            {[1,2,3].map(i => (
              <div key={i} className="rounded-xl bg-white/60 border border-indigo-100 p-4 space-y-2">
                <div className="h-3 bg-indigo-100 rounded w-2/3" />
                <div className="h-2 bg-slate-100 rounded w-full" />
                <div className="h-2 bg-slate-100 rounded w-5/6" />
                <div className="h-2 bg-slate-100 rounded w-4/6" />
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Suggestion tabs */}
        {suggestions.length > 0 && !loading && (
          <div className="space-y-3">

            {/* Tab selector */}
            <div className="flex gap-2">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => select(i)}
                  className={`flex-1 text-xs font-semibold px-3 py-2 rounded-lg border transition-all ${
                    selected === i
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  Option {i + 1}
                </button>
              ))}
            </div>

            {/* Selected suggestion */}
            {currentSuggestion && (
              <div className="rounded-xl bg-white border border-slate-200 overflow-hidden shadow-sm">
                {/* Subject */}
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Subject</p>
                  <p className="text-sm font-bold text-slate-800">{currentSuggestion.subject}</p>
                </div>

                {/* Body */}
                <div className="px-4 py-3">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Body</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {currentSuggestion.body}
                  </p>
                </div>

                {/* Meta */}
                <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-semibold">
                      {currentSuggestion.tone}
                    </span>
                    <span className="text-[11px] text-slate-400">{currentSuggestion.rationale}</span>
                  </div>
                  <button
                    onClick={() => copy(currentSuggestion)}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
                      copied
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100'
                    }`}
                  >
                    {copied
                      ? <><Check className="h-3.5 w-3.5" />Copied!</>
                      : <><Copy className="h-3.5 w-3.5" />Copy</>
                    }
                  </button>
                </div>
              </div>
            )}

            {/* Regenerate */}
            <button
              onClick={handleRegenerate}
              className="w-full flex items-center justify-center gap-1.5 text-xs text-indigo-500 hover:text-indigo-700 py-1.5 transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Regenerate with different suggestions
            </button>
          </div>
        )}
      </div>
    </div>
  );
}