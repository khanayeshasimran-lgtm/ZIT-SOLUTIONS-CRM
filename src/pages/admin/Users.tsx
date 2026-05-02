import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { callEdgeFunction } from '@/lib/api';
import { PageLoader } from '@/components/PageLoader';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/PaginationControls';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import {
  Search, Users as UsersIcon, Shield, UserCheck, Copy, Check, Building2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

type UserRow = {
  id: string;
  email: string;
  role: string | null;
  created_at: string;
  full_name?: string | null;
};

type AppRole = 'user' | 'admin' | 'manager' | 'investor' | 'client';

type Company = {
  id: string;
  name: string;
  organization_id: string | null;
};

const ROLE_CFG: Record<string, { pill: string; label: string }> = {
  admin:    { pill: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',          label: 'Admin'    },
  manager:  { pill: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',    label: 'Manager'  },
  user:     { pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', label: 'User'     },
  investor: { pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',       label: 'Investor' },
  client:   { pill: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200',          label: 'Client'   },
  default:  { pill: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',      label: 'User'     },
};

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: number; icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex items-center gap-3 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
      <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-xl font-black tabular-nums text-slate-800">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function UserAvatar({ email, name }: { email: string; name?: string | null }) {
  const initials = name
    ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : email[0].toUpperCase();
  const colors = [
    'from-indigo-400 to-indigo-600',
    'from-sky-400 to-sky-600',
    'from-violet-400 to-violet-600',
    'from-emerald-400 to-emerald-600',
    'from-amber-400 to-amber-600',
  ];
  const color = colors[email.charCodeAt(0) % colors.length];
  return (
    <div className={`h-8 w-8 rounded-full bg-gradient-to-br ${color} flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm`}>
      {initials}
    </div>
  );
}

export default function Users() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [users,      setUsers]      = useState<UserRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [roleFilter, setRoleFilter] = useState<AppRole | 'ALL'>('ALL');
  const [changingId, setChangingId] = useState<string | null>(null);

  const [orgSlug, setOrgSlug] = useState<string>('');
  const [copied,  setCopied]  = useState(false);

  // Client dialog — only shown when assigning client role
  const [clientDialog,      setClientDialog]      = useState(false);
  const [pendingClient,     setPendingClient]      = useState<UserRow | null>(null);
  const [companies,         setCompanies]          = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId]  = useState('');
  const [assigningClient,   setAssigningClient]    = useState(false);

  useEffect(() => {
    if (!profile) return;
    if (profile.role !== 'admin') navigate('/dashboard', { replace: true });
  }, [profile, navigate]);

  useEffect(() => {
    if (!user || !profile || profile.role !== 'admin') return;
    fetchUsers();
    fetchOrgSlug();
    fetchCompanies();
  }, [user, profile]);

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('profiles')
      .select('id, email, role, created_at, full_name')
      .order('created_at', { ascending: true });
    if (!error) setUsers((data ?? []) as UserRow[]);
    setLoading(false);
  };

  const fetchOrgSlug = async () => {
    if (!(profile as any)?.organization_id) return;
    const { data } = await (supabase as any)
      .from('organizations')
      .select('slug')
      .eq('id', (profile as any).organization_id)
      .single();
    if (data?.slug) setOrgSlug(data.slug);
  };

  const fetchCompanies = async () => {
    const { data } = await (supabase as any)
      .from('companies')
      .select('id, name, organization_id')
      .order('name', { ascending: true });
    setCompanies((data ?? []) as Company[]);
  };

  const handleCopyCode = useCallback(() => {
    if (!orgSlug) return;
    const joinUrl = `${window.location.origin}/onboarding?code=${orgSlug}`;
    navigator.clipboard.writeText(joinUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [orgSlug]);

  const handleRoleChange = async (targetUser: UserRow, newRole: AppRole) => {
    if (!user || !profile) return;
    if (targetUser.id === user.id) return;
    if (targetUser.role === newRole) return;

    // Client role needs company selection first — open dialog
    if (newRole === 'client') {
      setPendingClient(targetUser);
      setSelectedCompanyId('');
      setClientDialog(true);
      return;
    }

    await commitRoleChange(targetUser, newRole, null);
  };

  // KEY FIX: commitRoleChange now passes companyId to the edge function.
  // The edge function writes role + company_id + organization_id atomically
  // using the service role key (bypasses RLS). The old client-side
  // supabase.from('profiles').update({ company_id }) is REMOVED — it was
  // blocked by RLS and silently failing, causing "No company linked".
  const commitRoleChange = async (
    targetUser: UserRow,
    newRole: AppRole,
    companyId: string | null,
  ) => {
    setChangingId(targetUser.id);
    try {
      const selectedCompany = companyId
        ? companies.find(c => c.id === companyId)
        : undefined;

      const result = await callEdgeFunction<{ success: boolean; error?: string }>(
        'update-user-role',
        {
          targetUserId: targetUser.id,
          newRole,
          // For client assignments, pass both IDs — edge fn writes them server-side
          ...(newRole === 'client' && {
            companyId:      companyId ?? null,
            organizationId: selectedCompany?.organization_id ?? null,
          }),
        },
      );

      if (!result.success) throw new Error(result.error ?? 'Failed to update role');

      // No client-side profile update needed — edge function handled it all.

      setUsers(prev =>
        prev.map(u => u.id === targetUser.id ? { ...u, role: newRole } : u),
      );
      toast({ title: `Role updated to ${newRole}` });
    } catch (err: any) {
      toast({
        variant:     'destructive',
        title:       'Role change failed',
        description: err.message ?? 'Please try again.',
      });
    } finally {
      setChangingId(null);
    }
  };

  const handleClientConfirm = async () => {
    if (!pendingClient || !selectedCompanyId) return;
    setAssigningClient(true);
    await commitRoleChange(pendingClient, 'client', selectedCompanyId);
    setAssigningClient(false);
    setClientDialog(false);
    setPendingClient(null);
  };

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      u.email.toLowerCase().includes(q) ||
      (u.full_name ?? '').toLowerCase().includes(q);
    const matchRole = roleFilter === 'ALL' || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const { paginatedData: paged, paginationProps } = usePagination(filtered, 20);

  const roleCounts = users.reduce((acc, u) => {
    acc[u.role ?? 'user'] = (acc[u.role ?? 'user'] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Users</h1>
        <p className="text-muted-foreground text-sm mt-0.5">{users.length} team members</p>
      </div>

      {/* Invite code banner */}
      {orgSlug && (
        <div className="bg-indigo-50 border border-indigo-200/80 rounded-xl p-4 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-indigo-700">
            <Building2 className="h-4 w-4 shrink-0" />
            <span className="text-sm font-semibold">Team invite link</span>
          </div>
          <code className="flex-1 font-mono text-sm bg-white border border-indigo-200 text-indigo-800 px-3 py-1.5 rounded-lg min-w-0 truncate">
            {window.location.origin}/onboarding?code={orgSlug}
          </code>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopyCode}
            className="border-indigo-300 text-indigo-700 hover:bg-indigo-100 shrink-0"
          >
            {copied
              ? <><Check className="h-3.5 w-3.5 mr-1.5" />Copied!</>
              : <><Copy className="h-3.5 w-3.5 mr-1.5" />Copy link</>
            }
          </Button>
          <p className="w-full text-xs text-indigo-500 -mt-1">
            Share this link with new team members. They'll land on the onboarding page with the code pre-filled.
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total users" value={users.length}            icon={UsersIcon} color="bg-indigo-50 text-indigo-600" />
        <StatCard label="Admins"      value={roleCounts.admin || 0}   icon={Shield}    color="bg-blue-50 text-blue-600" />
        <StatCard label="Managers"    value={roleCounts.manager || 0} icon={UserCheck} color="bg-violet-50 text-violet-600" />
        <StatCard label="Users"       value={roleCounts.user || 0}    icon={UsersIcon} color="bg-emerald-50 text-emerald-600" />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by email or name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-9 pl-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['ALL', 'admin', 'manager', 'user', 'investor', 'client'] as const).map(r => {
            const cfg    = r === 'ALL'
              ? { pill: 'bg-slate-800 text-white', label: 'All' }
              : (ROLE_CFG[r] ?? ROLE_CFG.default);
            const active = roleFilter === r;
            return (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ring-1 ${
                  active ? cfg.pill : 'bg-background text-muted-foreground ring-border hover:ring-input'
                }`}
              >
                {cfg.label}
                {r !== 'ALL' && roleCounts[r] ? ` (${roleCounts[r]})` : ''}
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-[0_1px_6px_rgba(0,0,0,0.04)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-100">
              <th className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">User</th>
              <th className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Role</th>
              <th className="p-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Joined</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 && (
              <tr><td colSpan={3} className="p-10 text-center text-muted-foreground">No users found</td></tr>
            )}
            {paged.map(u => {
              const isSelf  = u.id === user?.id;
              const roleCfg = ROLE_CFG[u.role ?? 'user'] ?? ROLE_CFG.default;
              return (
                <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <UserAvatar email={u.email} name={u.full_name} />
                      <div>
                        <p className="font-medium text-slate-800">{u.full_name || u.email.split('@')[0]}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                      {isSelf && (
                        <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">You</span>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    {isSelf ? (
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${roleCfg.pill}`}>
                        {roleCfg.label}
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <select
                          value={u.role ?? 'user'}
                          disabled={changingId === u.id}
                          onChange={e => { void handleRoleChange(u, e.target.value as AppRole); }}
                          className="border border-input rounded-lg px-2.5 py-1.5 text-xs bg-background hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-ring/20 transition-all cursor-pointer"
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                          <option value="manager">Manager</option>
                          <option value="investor">Investor</option>
                          <option value="client">Client</option>
                        </select>
                        {changingId === u.id && (
                          <span className="text-xs text-muted-foreground animate-pulse">Saving…</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <p className="text-xs text-slate-600">
                      {formatDistanceToNow(new Date(u.created_at), { addSuffix: true })}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString()}
                    </p>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {paged.map(u => {
          const isSelf  = u.id === user?.id;
          const roleCfg = ROLE_CFG[u.role ?? 'user'] ?? ROLE_CFG.default;
          return (
            <div key={u.id} className="bg-white border border-slate-200/80 rounded-xl p-4 space-y-3 shadow-sm">
              <div className="flex items-center gap-3">
                <UserAvatar email={u.email} name={u.full_name} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-800 truncate">{u.full_name || u.email.split('@')[0]}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${roleCfg.pill}`}>
                  {roleCfg.label}
                </span>
              </div>
              {!isSelf && (
                <select
                  value={u.role ?? 'user'}
                  disabled={changingId === u.id}
                  onChange={e => { void handleRoleChange(u, e.target.value as AppRole); }}
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                  <option value="investor">Investor</option>
                  <option value="client">Client</option>
                </select>
              )}
              {changingId === u.id && (
                <p className="text-xs text-muted-foreground animate-pulse text-center">Saving…</p>
              )}
            </div>
          );
        })}
      </div>

      <PaginationControls {...paginationProps} />

      {/* Client company picker dialog */}
      <Dialog open={clientDialog} onOpenChange={open => { if (!open) { setClientDialog(false); setPendingClient(null); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Assign client to a company</DialogTitle>
            <DialogDescription>
              Choose which company <strong>{pendingClient?.full_name || pendingClient?.email}</strong> is a client of.
              The portal will show only data linked to this company.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Company *</Label>
              {companies.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No companies found. Add a company in the Companies page first.
                </p>
              ) : (
                <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                  <SelectTrigger><SelectValue placeholder="Select a company…" /></SelectTrigger>
                  <SelectContent>
                    {companies.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedCompanyId && companies.find(c => c.id === selectedCompanyId)?.organization_id === null && (
                <p className="text-xs text-amber-600">
                  ⚠️ This company has no linked organization. Projects and documents tabs in the portal may be empty.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setClientDialog(false); setPendingClient(null); }} disabled={assigningClient}>
                Cancel
              </Button>
              <Button onClick={handleClientConfirm} disabled={!selectedCompanyId || assigningClient}>
                {assigningClient ? 'Saving…' : 'Confirm client role'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}