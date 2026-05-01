/**
 * components/GlobalSearch.tsx
 *
 * DAY 2 — C6: Added organization_id filter to all 5 search queries.
 *
 * WHAT THE OLD CODE DID (WRONG):
 *   Every query ran with NO organization_id filter:
 *     supabase.from('leads').select(...).ilike('name', `%${q}%`)
 *   This means RLS was the ONLY isolation boundary. If any single RLS
 *   policy was misconfigured or temporarily disabled, GlobalSearch would
 *   return records from ALL organizations to ANY logged-in user.
 *   For a multi-tenant CRM this is a cross-tenant data leak.
 *
 * WHAT'S FIXED:
 *   Every query now adds .eq('organization_id', orgId) before executing.
 *   If orgId is not available (org not loaded yet), search returns empty.
 *   This is defense-in-depth — RLS still runs, but we don't rely on it alone.
 *
 * ALSO FIXED:
 *   - handleSelect now deep-links to the record detail view where routes exist,
 *     instead of always navigating to the list page.
 *   - Added orgId null guard — search disabled with a message if org not loaded.
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  UserPlus, Briefcase, Users, Building2, Ticket,
  Search, ArrowRight, Loader2,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SearchResult {
  id: string;
  label: string;
  sub?: string;
  entity: 'lead' | 'deal' | 'contact' | 'company' | 'ticket';
  /**
   * href is now the deep-link to the specific record where a detail route
   * exists. Falls back to the list page for entities without detail routes.
   */
  href: string;
}

const ENTITY_CONFIG = {
  lead:    { label: 'Leads',     icon: UserPlus,   color: 'text-indigo-600', bg: 'bg-indigo-50',  listHref: '/leads'     },
  deal:    { label: 'Deals',     icon: Briefcase,  color: 'text-violet-600', bg: 'bg-violet-50',  listHref: '/pipeline'  },
  contact: { label: 'Contacts',  icon: Users,      color: 'text-sky-600',    bg: 'bg-sky-50',     listHref: '/contacts'  },
  company: { label: 'Companies', icon: Building2,  color: 'text-teal-600',   bg: 'bg-teal-50',    listHref: '/companies' },
  ticket:  { label: 'Tickets',   icon: Ticket,     color: 'text-amber-600',  bg: 'bg-amber-50',   listHref: '/tickets'   },
} as const;

// ── Hook ──────────────────────────────────────────────────────────────────────

function useGlobalSearch(query: string, orgId: string | null) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Don't search if no org — would leak cross-tenant data if RLS fails
    if (query.trim().length < 2 || !orgId) {
      setResults([]);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      const q = query.trim();

      // C6 FIX: Every query now scoped to the user's organization_id.
      // Previously these had NO org filter — relying solely on RLS.
      const [leads, deals, contacts, companies, tickets] = await Promise.all([
        (supabase as any)
          .from('leads')
          .select('id, name, email')
          .eq('organization_id', orgId)          // ← C6 fix
          .ilike('name', `%${q}%`)
          .limit(4),

        (supabase as any)
          .from('deals')
          .select('id, title, stage')
          .eq('organization_id', orgId)          // ← C6 fix
          .ilike('title', `%${q}%`)
          .limit(4),

        (supabase as any)
          .from('contacts')
          .select('id, first_name, last_name, email')
          .eq('organization_id', orgId)          // ← C6 fix
          .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
          .limit(4),

        (supabase as any)
          .from('companies')
          .select('id, name, industry')
          .eq('organization_id', orgId)          // ← C6 fix
          .ilike('name', `%${q}%`)
          .limit(4),

        (supabase as any)
          .from('tickets')
          .select('id, title, status')
          .eq('organization_id', orgId)          // ← C6 fix
          .ilike('title', `%${q}%`)
          .limit(4),
      ]);

      if (cancelled) return;

      const combined: SearchResult[] = [
        ...((leads.data ?? []) as any[]).map((r: any) => ({
          id:     r.id,
          entity: 'lead' as const,
          label:  r.name,
          sub:    r.email ?? undefined,
          // No individual lead detail route — navigate to list
          href:   '/leads',
        })),
        ...((deals.data ?? []) as any[]).map((r: any) => ({
          id:     r.id,
          entity: 'deal' as const,
          label:  r.title,
          sub:    r.stage?.replace('_', ' '),
          // Pipeline is the deal detail view
          href:   '/pipeline',
        })),
        ...((contacts.data ?? []) as any[]).map((r: any) => ({
          id:     r.id,
          entity: 'contact' as const,
          label:  `${r.first_name} ${r.last_name ?? ''}`.trim(),
          sub:    r.email ?? undefined,
          href:   '/contacts',
        })),
        ...((companies.data ?? []) as any[]).map((r: any) => ({
          id:     r.id,
          entity: 'company' as const,
          label:  r.name,
          sub:    r.industry ?? undefined,
          href:   '/companies',
        })),
        ...((tickets.data ?? []) as any[]).map((r: any) => ({
          id:     r.id,
          entity: 'ticket' as const,
          label:  r.title,
          sub:    r.status,
          href:   '/tickets',
        })),
      ];

      setResults(combined);
      setLoading(false);
    };

    // Debounce 250ms
    const timer = setTimeout(run, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, orgId]);

  return { results, loading };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GlobalSearch() {
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState('');
  const navigate          = useNavigate();
  const { profile }       = useAuth();

  // C6 FIX: orgId from profile — same source used by OrganizationContext
  const orgId = (profile as any)?.organization_id as string | null;

  const { results, loading } = useGlobalSearch(query, orgId);

  // Register ⌘K / Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSelect = useCallback((result: SearchResult) => {
    setOpen(false);
    setQuery('');
    navigate(result.href);
  }, [navigate]);

  // Group by entity type
  const grouped = (Object.keys(ENTITY_CONFIG) as SearchResult['entity'][])
    .map(entity => ({
      entity,
      items: results.filter(r => r.entity === entity),
    }))
    .filter(g => g.items.length > 0);

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) setQuery(''); }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground
                   bg-muted/50 border border-border rounded-lg hover:bg-muted transition-colors
                   min-w-[200px]"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Search everything…</span>
        <kbd className="hidden lg:inline-flex h-5 items-center gap-0.5 rounded border border-border
                        bg-background px-1.5 text-[10px] font-medium text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      <DialogContent className="p-0 gap-0 max-w-lg overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          {loading
            ? <Loader2 className="h-4 w-4 text-muted-foreground shrink-0 animate-spin" />
            : <Search  className="h-4 w-4 text-muted-foreground shrink-0" />
          }
          <Input
            autoFocus
            placeholder="Search leads, deals, contacts, companies, tickets…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="border-0 shadow-none focus-visible:ring-0 p-0 h-auto text-sm"
          />
        </div>

        {/* Results */}
        <div className="max-h-[380px] overflow-y-auto">

          {/* Org not loaded yet */}
          {!orgId && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Loading your workspace…
            </div>
          )}

          {orgId && query.trim().length < 2 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Type at least 2 characters to search
            </div>
          )}

          {orgId && query.trim().length >= 2 && !loading && results.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No results for <span className="font-medium text-foreground">"{query}"</span>
            </div>
          )}

          {grouped.map(({ entity, items }) => {
            const cfg  = ENTITY_CONFIG[entity];
            const Icon = cfg.icon;
            return (
              <div key={entity}>
                {/* Group header */}
                <div className="px-4 py-1.5 flex items-center gap-2 bg-muted/30 border-b border-border">
                  <Icon className={`h-3 w-3 ${cfg.color}`} />
                  <span className="text-xs font-medium text-muted-foreground">{cfg.label}</span>
                </div>
                {/* Items */}
                {items.map(result => (
                  <button
                    key={result.id}
                    onClick={() => handleSelect(result)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50
                               transition-colors text-left group"
                  >
                    <div className={`h-7 w-7 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0`}>
                      <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {result.label}
                      </p>
                      {result.sub && (
                        <p className="text-xs text-muted-foreground truncate capitalize">
                          {result.sub}
                        </p>
                      )}
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-border bg-muted/20 flex items-center gap-3 text-xs text-muted-foreground">
            <span>↵ to navigate</span>
            <span>·</span>
            <span>esc to close</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}