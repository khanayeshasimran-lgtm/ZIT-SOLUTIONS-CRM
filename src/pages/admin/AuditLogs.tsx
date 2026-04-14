import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { exportToCSV, exportToExcel, exportToPDF } from '@/utils/export';
import { ExportDropdown } from '@/components/ExportDropdown';
import { logAudit } from '@/lib/audit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { PageLoader } from '@/components/PageLoader';

/* ================= TYPES ================= */

type AuditLog = {
  id: string;
  action: string;
  entity: string;
  entity_id: string | null;
  created_at: string;
  user_email: string | null;
};

type ActionFilter = 'ALL' | 'VIEW' | 'CHANGE' | 'DELETE' | 'EXPORT';
type SearchMode = 'TEXT' | 'DATE' | 'PRESET';

/* ================= DEBOUNCE ================= */

function useDebounce<T>(value: T, delay = 400) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}

/* ================= PAGE ================= */

export default function AuditLogs() {
  const { user, profile } = useAuth();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchMode, setSearchMode] = useState<SearchMode>('TEXT');
  const [actionFilter, setActionFilter] = useState<ActionFilter>('ALL');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  /* ================= ACCESS ================= */

  // Wait for profile to load before access check
  if (!profile) return <PageLoader />;
  if (profile.role !== 'admin') {
    return <div className="p-6">Access denied</div>;
  }

  /* ================= FETCH ================= */

  const fetchLogs = async () => {
    setLoading(true);

    let query = (supabase as any)
      .from('audit_logs')
      .select('id, action, entity, entity_id, created_at, user_email')
      .order('created_at', { ascending: false });

    if (actionFilter !== 'ALL') {
      query = query.ilike('action', `${actionFilter}%`);
    }

    if (searchMode === 'TEXT' && debouncedSearch) {
      query = query.or(
        `user_email.ilike.%${debouncedSearch}%,action.ilike.%${debouncedSearch}%,entity.ilike.%${debouncedSearch}%`
      );
    }

    if (searchMode !== 'TEXT') {
      if (fromDate) query = query.gte('created_at', `${fromDate}T00:00:00`);
      if (toDate)   query = query.lte('created_at', `${toDate}T23:59:59`);
    }

    const { data, error } = await query;

    if (error) {
      console.error(error);
      setLogs([]);
    } else {
      setLogs((data ?? []) as AuditLog[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, [actionFilter, debouncedSearch, fromDate, toDate, searchMode]);

  /* ================= PRESETS ================= */

  const applyPreset = (days: 'today' | '7' | '30') => {
    const now = new Date();
    const start = new Date();
    if (days === 'today') {
      start.setHours(0, 0, 0, 0);
    } else {
      start.setDate(now.getDate() - Number(days));
    }
    setFromDate(start.toISOString().slice(0, 10));
    setToDate(now.toISOString().slice(0, 10));
  };

  /* ================= EXPORT ================= */

  const handleExport = async (type: 'csv' | 'excel' | 'pdf') => {
    if (!logs.length) return;

    const rows = logs.map((l) => ({
      User:    l.user_email ?? 'System',
      Action:  l.action,
      Entity:  l.entity,
      Details: l.entity_id ?? '',
      Time:    new Date(l.created_at).toLocaleString(),
    }));

    if (type === 'csv')   exportToCSV('audit_logs', rows);
    if (type === 'excel') exportToExcel('audit_logs', rows);
    if (type === 'pdf')   exportToPDF('audit_logs', rows, {
      title: 'ZIT Solutions – CRM',
      subtitle: 'Audit Logs Report',
      exportedBy: user?.email ?? 'System',
    });

    await logAudit({
      userId:    user?.id,
      userEmail: user?.email,
      action:    'EXPORT',
      entity:    'audit_logs',
      entityId:  `${type.toUpperCase()} (${rows.length} rows)`,
    });
  };

  /* ================= UI HELPERS ================= */

  const actionBadge = (action: string) => {
    if (action.startsWith('VIEW'))   return 'bg-blue-100 text-blue-700';
    if (action.startsWith('CHANGE')) return 'bg-orange-100 text-orange-700';
    if (action.startsWith('DELETE')) return 'bg-red-100 text-red-700';
    if (action.startsWith('EXPORT')) return 'bg-purple-100 text-purple-700';
    return 'bg-gray-100 text-gray-700';
  };

  /* ================= RENDER ================= */

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Audit Logs</h1>

      {/* FILTER BAR */}
      <div className="space-y-3">
        {/* ROW 1 — Action + Export */}
        <div className="grid grid-cols-2 gap-2 md:flex md:justify-between md:items-center">
          <Select
            value={actionFilter}
            onValueChange={(v) => setActionFilter(v as ActionFilter)}
          >
            <SelectTrigger className="h-10 w-full md:w-[180px]">
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All actions</SelectItem>
              <SelectItem value="VIEW">View</SelectItem>
              <SelectItem value="CHANGE">Change</SelectItem>
              <SelectItem value="DELETE">Delete</SelectItem>
              <SelectItem value="EXPORT">Export</SelectItem>
            </SelectContent>
          </Select>

          <div className="h-10 w-full md:w-auto">
            <ExportDropdown disabled={logs.length === 0} onExport={handleExport} />
          </div>
        </div>

        {/* ROW 2 — Search controls */}
        <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:gap-2">
          <Select
            value={searchMode}
            onValueChange={(v) => setSearchMode(v as SearchMode)}
          >
            <SelectTrigger className="h-10 w-full md:w-[180px]">
              <SelectValue placeholder="Search by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TEXT">Search by text</SelectItem>
              <SelectItem value="DATE">Search by date</SelectItem>
              <SelectItem value="PRESET">Quick ranges</SelectItem>
            </SelectContent>
          </Select>

          {searchMode === 'TEXT' && (
            <Input
              placeholder="Email / action / entity"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full md:w-[240px]"
            />
          )}

          {searchMode === 'DATE' && (
            <>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-10 w-full" />
              <Input type="date" value={toDate}   onChange={(e) => setToDate(e.target.value)}   className="h-10 w-full" />
            </>
          )}

          {searchMode === 'PRESET' && (
            <>
              <Button variant="outline" className="h-10 w-full md:w-auto" onClick={() => applyPreset('today')}>Today</Button>
              <Button variant="outline" className="h-10 w-full md:w-auto" onClick={() => applyPreset('7')}>Last 7 days</Button>
              <Button variant="outline" className="h-10 w-full md:w-auto" onClick={() => applyPreset('30')}>Last 30 days</Button>
            </>
          )}
        </div>
      </div>

      {/* TABLE */}
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-3 text-left">User</th>
              <th className="p-3 text-left">Action</th>
              <th className="p-3 text-left">Entity</th>
              <th className="p-3 text-left">Details</th>
              <th className="p-3 text-left">Time</th>
            </tr>
          </thead>

          <tbody>
            {!loading && logs.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  No audit logs found
                </td>
              </tr>
            )}
            {logs.map((log) => (
              <tr key={log.id} className="border-t">
                <td className="p-3">{log.user_email ?? 'System'}</td>
                <td className="p-3">
                  <Badge className={actionBadge(log.action)}>{log.action}</Badge>
                </td>
                <td className="p-3">{log.entity}</td>
                <td className="p-3 text-muted-foreground">{log.entity_id ?? '—'}</td>
                <td className="p-3">{new Date(log.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}