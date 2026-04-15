import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirmDelete } from '@/hooks/useConfirmDelete';
import { logAudit } from '@/lib/audit';
import { PageLoader } from '@/components/PageLoader';
import { MobileCard } from '@/components/MobileCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataTable } from '@/components/ui/DataTable';
import { Textarea } from '@/components/ui/textarea';
import { exportToCSV, exportToExcel, exportToPDF } from '@/utils/export';
import { ExportDropdown } from '@/components/ExportDropdown';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Calendar, Plus, Trash2, Pencil, Video, MapPin, Users,
  UserPlus, Building2, Clock, ChevronLeft, ChevronRight,
  List, CalendarDays,
} from 'lucide-react';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameMonth, isSameDay, isToday, addMonths, subMonths,
  parseISO, startOfWeek, endOfWeek,
} from 'date-fns';

type MeetingType   = 'discovery' | 'demo' | 'follow_up' | 'check_in' | 'internal' | 'other';
type MeetingStatus = 'scheduled' | 'completed' | 'cancelled' | 'active' | 'on_hold';
type MeetingMode   = 'virtual' | 'in_person' | 'phone';

interface Meeting {
  id: string;
  title: string;
  description: string | null;
  agenda: string | null;
  notes: string | null;
  meeting_type: MeetingType;
  status: MeetingStatus;
  mode: MeetingMode;
  start_time: string;
  end_time: string | null;
  location: string | null;
  video_link: string | null;
  attendees: string | null;
  created_at: string;
  lead_id:    string | null;
  contact_id: string | null;
  company_id: string | null;
  lead_name?:    string | null;
  contact_name?: string | null;
  company_name?: string | null;
  linked_activity_id?: string | null;
}

interface LinkedRecord { id: string; label: string; }

const typeLabels: Record<MeetingType, string> = {
  discovery: 'Discovery', demo: 'Demo', follow_up: 'Follow-up',
  check_in: 'Check-in', internal: 'Internal', other: 'Other',
};

const typeColors: Record<MeetingType, string> = {
  discovery: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  demo:      'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
  follow_up: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  check_in:  'bg-teal-50 text-teal-700 ring-1 ring-teal-200',
  internal:  'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
  other:     'bg-muted text-muted-foreground ring-1 ring-border',
};

const typeAccents: Record<MeetingType, string> = {
  discovery: '#3b82f6', demo: '#8b5cf6', follow_up: '#f59e0b',
  check_in: '#14b8a6', internal: '#94a3b8', other: '#94a3b8',
};

const statusColors: Record<MeetingStatus, string> = {
  scheduled:  'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  completed:  'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  cancelled:  'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
  active:     'bg-green-50 text-green-700 ring-1 ring-green-200',
  on_hold:    'bg-red-50 text-red-600 ring-1 ring-red-200',
};

const modeIcons: Record<MeetingMode, React.ElementType> = {
  virtual:   Video,
  in_person: MapPin,
  phone:     Clock,
};

// ─── Map meeting status → activity status ────────────────────────────────────
const meetingStatusToActivity = (s: MeetingStatus): string => {
  if (s === 'completed') return 'completed';
  if (s === 'cancelled') return 'cancelled';
  return 'scheduled';
};

// ─── Calendar cell ────────────────────────────────────────────────────────────
function CalendarCell({
  day, meetings, currentMonth, onSelect,
}: {
  day: Date; meetings: Meeting[]; currentMonth: Date; onSelect: (m: Meeting) => void;
}) {
  const dayMeetings = meetings.filter(m => isSameDay(parseISO(m.start_time), day));
  const inMonth = isSameMonth(day, currentMonth);

  return (
    <div className={`min-h-[90px] border-b border-r p-1.5 ${inMonth ? 'bg-card' : 'bg-muted/20'}`}>
      <span className={`text-xs font-medium inline-flex h-6 w-6 items-center justify-center rounded-full
        ${isToday(day) ? 'bg-indigo-600 text-white' : inMonth ? 'text-foreground' : 'text-muted-foreground'}`}>
        {format(day, 'd')}
      </span>
      <div className="mt-1 space-y-0.5">
        {dayMeetings.slice(0, 3).map(m => (
          <button
            key={m.id}
            onClick={() => onSelect(m)}
            className={`w-full text-left text-[10px] px-1.5 py-0.5 rounded truncate font-medium transition-opacity hover:opacity-80 ${typeColors[m.meeting_type]}`}
          >
            {format(parseISO(m.start_time), 'h:mm a')} {m.title}
            {m.linked_activity_id && <span className="ml-1 opacity-60">↔</span>}
          </button>
        ))}
        {dayMeetings.length > 3 && (
          <p className="text-[10px] text-muted-foreground px-1">+{dayMeetings.length - 3} more</p>
        )}
      </div>
    </div>
  );
}

export default function Meetings() {
  const { user, role, profile } = useAuth();
  const { toast } = useToast();
  const { confirm, ConfirmDeleteDialog } = useConfirmDelete();

  const canManage = role === 'admin' || role === 'manager';

  const [meetings,  setMeetings]  = useState<Meeting[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);

  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const [leads,     setLeads]     = useState<LinkedRecord[]>([]);
  const [contacts,  setContacts]  = useState<LinkedRecord[]>([]);
  const [companies, setCompanies] = useState<LinkedRecord[]>([]);
  const [members,   setMembers]   = useState<{ id: string; email: string }[]>([]);

  const emptyForm = {
    title: '', description: '', agenda: '', notes: '',
    meeting_type: 'discovery' as MeetingType,
    status: 'scheduled' as MeetingStatus,
    mode: 'virtual' as MeetingMode,
    start_time: '', end_time: '',
    location: '', video_link: '', attendees: '',
    lead_id: '', contact_id: '', company_id: '',
  };
  const [form, setForm] = useState(emptyForm);

  const fetchOptions = async () => {
    const [{ data: ld }, { data: cd }, { data: cod }, { data: pd }] = await Promise.all([
      supabase.from('leads').select('id, name').order('name'),
      supabase.from('contacts').select('id, first_name, last_name').order('first_name'),
      supabase.from('companies').select('id, name').order('name'),
      supabase.from('profiles').select('id, email').order('email'),
    ]);
    const mLeads     = (ld  ?? []).map((l: any) => ({ id: l.id, label: l.name }));
    const mContacts  = (cd  ?? []).map((c: any) => ({ id: c.id, label: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() }));
    const mCompanies = (cod ?? []).map((c: any) => ({ id: c.id, label: c.name }));
    setLeads(mLeads);
    setContacts(mContacts);
    setCompanies(mCompanies);
    setMembers((pd ?? []).map((p: any) => ({ id: p.id, email: p.email })));
    return { mLeads, mContacts, mCompanies };
  };

  const fetchMeetings = async (
    lMap: LinkedRecord[] = [],
    cMap: LinkedRecord[] = [],
    coMap: LinkedRecord[] = [],
  ) => {
    if (!user) return;
    const { data, error } = await (supabase as any)
      .from('meetings')
      .select('*')
      .order('start_time', { ascending: false });

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } else {
      const mapped = (data ?? []).map((m: any) => ({
        ...m,
        lead_name:    lMap.find(l  => l.id === m.lead_id)?.label    ?? null,
        contact_name: cMap.find(c  => c.id === m.contact_id)?.label ?? null,
        company_name: coMap.find(c => c.id === m.company_id)?.label ?? null,
      }));
      setMeetings(mapped);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOptions().then(({ mLeads, mContacts, mCompanies }) => {
      fetchMeetings(mLeads, mContacts, mCompanies);
    });
  }, [user]);

  const refetch = () =>
    fetchOptions().then(({ mLeads, mContacts, mCompanies }) =>
      fetchMeetings(mLeads, mContacts, mCompanies)
    );

  const resetForm = () => { setForm(emptyForm); setEditingMeeting(null); };

  // ─── Sync: create or update a linked Activity for every meeting ───────────
  const syncToActivity = async (
    meetingId: string,
    title: string,
    description: string | null,
    status: MeetingStatus,
    start_time: string | null,
    existingActivityId: string | null | undefined,
    lead_id?: string | null,
    deal_id?: string | null,
  ): Promise<string | null> => {
    const activityPayload = {
      type: 'meeting' as const,
      title,
      description: description || null,
      status: meetingStatusToActivity(status),
      due_date: start_time || null,
      linked_meeting_id: meetingId,
      lead_id: lead_id || null,
      deal_id: deal_id || null,
    };

    if (existingActivityId) {
      const { error } = await (supabase as any)
        .from('activities')
        .update(activityPayload)
        .eq('id', existingActivityId);
      if (error) {
        console.error('Failed to sync activity update:', error.message);
        return existingActivityId;
      }
      return existingActivityId;
    } else {
      const { data, error } = await (supabase as any)
        .from('activities')
        .insert([{ ...activityPayload, created_by: user?.id }])
        .select('id')
        .single();
      if (error) {
        console.error('Failed to create linked activity:', error.message);
        return null;
      }
      return data?.id ?? null;
    }
  };

  // ─── Sync: delete linked activity when meeting is deleted ────────────────
  const deleteSyncedActivity = async (activityId: string) => {
    const { error } = await (supabase as any)
      .from('activities')
      .delete()
      .eq('id', activityId);
    if (error) console.error('Failed to delete linked activity:', error.message);
  };

  const handleEdit = (meeting: Meeting) => {
    setEditingMeeting(meeting);
    setForm({
      title:        meeting.title,
      description:  meeting.description  || '',
      agenda:       meeting.agenda       || '',
      notes:        meeting.notes        || '',
      meeting_type: meeting.meeting_type,
      status:       meeting.status,
      mode:         meeting.mode,
      start_time:   meeting.start_time   ? meeting.start_time.slice(0, 16) : '',
      end_time:     meeting.end_time     ? meeting.end_time.slice(0, 16)   : '',
      location:     meeting.location     || '',
      video_link:   meeting.video_link   || '',
      attendees:    meeting.attendees    || '',
      lead_id:      meeting.lead_id      || '',
      contact_id:   meeting.contact_id   || '',
      company_id:   meeting.company_id   || '',
    });
    setDetailOpen(false);
    setDialogOpen(true);
  };

  const handleDelete = (meeting: Meeting) => {
    confirm({
      title: `Delete "${meeting.title}"?`,
      description: meeting.linked_activity_id
        ? 'This will also delete the linked activity. This action cannot be undone.'
        : 'This action cannot be undone.',
      onConfirm: async () => {
        if (meeting.linked_activity_id) {
          await deleteSyncedActivity(meeting.linked_activity_id);
        }
        const { error } = await (supabase as any).from('meetings').delete().eq('id', meeting.id);
        if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
        logAudit({ userId: user?.id, userEmail: profile?.email, action: 'DELETE', entity: 'meetings', entityId: meeting.id });
        toast({ title: 'Meeting deleted' });
        setDetailOpen(false);
        refetch();
      },
    });
  };

  const handleStatusChange = async (meeting: Meeting, newStatus: MeetingStatus) => {
    const { error } = await (supabase as any)
      .from('meetings')
      .update({ status: newStatus })
      .eq('id', meeting.id);
    if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }

    // Sync status to linked activity
    if (meeting.linked_activity_id) {
      await (supabase as any)
        .from('activities')
        .update({ status: meetingStatusToActivity(newStatus) })
        .eq('id', meeting.linked_activity_id);
    }

    toast({ title: `Marked as ${newStatus.replace('_', ' ')}` });
    setSelectedMeeting(prev => prev ? { ...prev, status: newStatus } : null);
    refetch();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      title:        form.title,
      description:  form.description  || null,
      agenda:       form.agenda       || null,
      notes:        form.notes        || null,
      meeting_type: form.meeting_type,
      status:       form.status,
      mode:         form.mode,
      start_time:   form.start_time   || null,
      end_time:     form.end_time     || null,
      location:     form.location     || null,
      video_link:   form.video_link   || null,
      attendees:    form.attendees    || null,
      lead_id:      form.lead_id      || null,
      contact_id:   form.contact_id   || null,
      company_id:   form.company_id   || null,
    };

    if (editingMeeting) {
      // ── UPDATE ──────────────────────────────────────────────────────────────
      const { error } = await (supabase as any)
        .from('meetings')
        .update(payload)
        .eq('id', editingMeeting.id);
      if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }

      // Sync to linked activity — create one if it doesn't exist yet
      const activityId = await syncToActivity(
        editingMeeting.id,
        form.title,
        form.description || null,
        form.status,
        form.start_time || null,
        editingMeeting.linked_activity_id,
        form.lead_id || null,
        null,
      );

      // Persist updated linked_activity_id if it changed (e.g. first sync)
      if (activityId && activityId !== editingMeeting.linked_activity_id) {
        await (supabase as any)
          .from('meetings')
          .update({ linked_activity_id: activityId })
          .eq('id', editingMeeting.id);
      }

      logAudit({ userId: user?.id, userEmail: profile?.email, action: 'UPDATE', entity: 'meetings', entityId: editingMeeting.id });
      toast({ title: 'Meeting updated' });

    } else {
      // ── CREATE ──────────────────────────────────────────────────────────────
      const { data: newMeeting, error } = await (supabase as any)
        .from('meetings')
        .insert([{ ...payload, created_by: user?.id }])
        .select('id')
        .single();
      if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }

      // Always create a linked activity for every new meeting
      if (newMeeting?.id) {
        const activityId = await syncToActivity(
          newMeeting.id,
          form.title,
          form.description || null,
          form.status,
          form.start_time || null,
          null,
          form.lead_id || null,
          null,
        );
        if (activityId) {
          await (supabase as any)
            .from('meetings')
            .update({ linked_activity_id: activityId })
            .eq('id', newMeeting.id);
        }
      }

      logAudit({ userId: user?.id, userEmail: profile?.email, action: 'CREATE', entity: 'meetings' });
      toast({ title: 'Meeting scheduled' });
    }

    setDialogOpen(false);
    resetForm();
    refetch();
  };

  const handleExport = (type: 'csv' | 'excel' | 'pdf') => {
    const rows = meetings.map(m => ({
      Title:     m.title,
      Type:      typeLabels[m.meeting_type],
      Status:    m.status,
      Mode:      m.mode,
      Start:     m.start_time ? format(parseISO(m.start_time), 'yyyy-MM-dd HH:mm') : '—',
      End:       m.end_time   ? format(parseISO(m.end_time),   'HH:mm') : '—',
      Location:  m.location   ?? '—',
      VideoLink: m.video_link ?? '—',
      Lead:      m.lead_name    ?? '—',
      Contact:   m.contact_name ?? '—',
      Company:   m.company_name ?? '—',
      Attendees: m.attendees   ?? '—',
    }));
    if (type === 'csv')   exportToCSV('meetings', rows);
    if (type === 'excel') exportToExcel('meetings', rows);
    if (type === 'pdf')   exportToPDF('meetings', rows, {
      title: 'ZIT Solutions – CRM',
      subtitle: 'Meetings Report',
      exportedBy: profile?.email ?? user?.email ?? 'System',
    });
    logAudit({ userId: user?.id, userEmail: profile?.email, action: 'EXPORT', entity: 'meetings', entityId: `${type.toUpperCase()} (${rows.length} rows)` });
  };

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(calendarMonth));
    const end   = endOfWeek(endOfMonth(calendarMonth));
    return eachDayOfInterval({ start, end });
  }, [calendarMonth]);

  const columns = [
    {
      key: 'title', header: 'Meeting',
      render: (m: Meeting) => {
        const ModeIcon = modeIcons[m.mode];
        return (
          <div className="flex items-start gap-2">
            <ModeIcon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                {m.title}
                {m.linked_activity_id && (
                  <span className="inline-flex items-center rounded-full bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200 px-1.5 py-0.5 text-[10px] font-medium">
                    ↔ synced
                  </span>
                )}
              </p>
              {m.description && <p className="text-xs text-muted-foreground truncate max-w-xs">{m.description}</p>}
            </div>
          </div>
        );
      },
    },
    {
      key: 'meeting_type', header: 'Type',
      render: (m: Meeting) => (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${typeColors[m.meeting_type]}`}>
          {typeLabels[m.meeting_type]}
        </span>
      ),
    },
    {
      key: 'status', header: 'Status',
      render: (m: Meeting) => (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColors[m.status]}`}>
          {m.status.charAt(0).toUpperCase() + m.status.slice(1).replace('_', ' ')}
        </span>
      ),
    },
    {
      key: 'start_time', header: 'When',
      render: (m: Meeting) => m.start_time
        ? <div className="text-sm">
            <p className="font-medium">{format(parseISO(m.start_time), 'MMM d, yyyy')}</p>
            <p className="text-muted-foreground">
              {format(parseISO(m.start_time), 'h:mm a')}
              {m.end_time && ` – ${format(parseISO(m.end_time), 'h:mm a')}`}
            </p>
          </div>
        : '—',
    },
    {
      key: 'linked', header: 'Linked to',
      render: (m: Meeting) => (
        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          {m.lead_name    && <span className="flex items-center gap-1"><UserPlus  className="h-3 w-3" />{m.lead_name}</span>}
          {m.contact_name && <span className="flex items-center gap-1"><Users     className="h-3 w-3" />{m.contact_name}</span>}
          {m.company_name && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{m.company_name}</span>}
          {!m.lead_name && !m.contact_name && !m.company_name && '—'}
        </div>
      ),
    },
    {
      key: 'actions', header: 'Actions',
      render: (meeting: Meeting) => (
        <div className="flex items-center gap-1">
          <Button
            size="sm" variant="ghost"
            className="hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
            onClick={() => { setSelectedMeeting(meeting); setDetailOpen(true); }}
          >
            View
          </Button>
          {canManage && (
            <>
              <Button variant="ghost" size="sm" className="hover:bg-indigo-50 hover:text-indigo-600 transition-colors" onClick={() => handleEdit(meeting)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="hover:bg-red-50 hover:text-red-500 transition-colors" onClick={() => handleDelete(meeting)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Meetings</h1>
          <p className="text-muted-foreground mt-1">Schedule and track all your meetings</p>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center border rounded-lg overflow-hidden">
            <Button
              variant={viewMode === 'calendar' ? 'default' : 'ghost'}
              size="sm" className="rounded-none"
              onClick={() => setViewMode('calendar')}
            >
              <CalendarDays className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm" className="rounded-none"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>

          <ExportDropdown onExport={handleExport} disabled={meetings.length === 0} />

          {canManage && (
            <Dialog open={dialogOpen} onOpenChange={open => { setDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />Schedule Meeting</Button>
              </DialogTrigger>

              <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingMeeting ? 'Edit Meeting' : 'Schedule Meeting'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-5">

                  <div className="space-y-2">
                    <Label>Title <span className="text-destructive">*</span></Label>
                    <Input
                      value={form.title}
                      onChange={e => setForm({ ...form, title: e.target.value })}
                      required
                      placeholder="e.g. Discovery call with Acme Corp"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Meeting Type</Label>
                      <Select value={form.meeting_type} onValueChange={v => setForm({ ...form, meeting_type: v as MeetingType })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.entries(typeLabels) as [MeetingType, string][]).map(([v, l]) => (
                            <SelectItem key={v} value={v}>{l}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Mode</Label>
                      <Select value={form.mode} onValueChange={v => setForm({ ...form, mode: v as MeetingMode })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="virtual">Virtual</SelectItem>
                          <SelectItem value="in_person">In Person</SelectItem>
                          <SelectItem value="phone">Phone</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={form.status} onValueChange={v => setForm({ ...form, status: v as MeetingStatus })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="scheduled">Scheduled</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="on_hold">On Hold</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{form.mode === 'virtual' ? 'Video Link' : 'Location'}</Label>
                      {form.mode === 'virtual'
                        ? <Input value={form.video_link} onChange={e => setForm({ ...form, video_link: e.target.value })} placeholder="https://meet.google.com/…" />
                        : <Input value={form.location}   onChange={e => setForm({ ...form, location:   e.target.value })} placeholder="Office address or room" />
                      }
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Start Time <span className="text-destructive">*</span></Label>
                      <Input
                        type="datetime-local"
                        value={form.start_time}
                        onChange={e => setForm({ ...form, start_time: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>End Time</Label>
                      <Input
                        type="datetime-local"
                        value={form.end_time}
                        onChange={e => setForm({ ...form, end_time: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Attendees</Label>
                    <Select
                      value={undefined}
                      onValueChange={v => {
                        const existing = form.attendees ? form.attendees.split(',').map(s => s.trim()) : [];
                        if (!existing.includes(v)) {
                          setForm({ ...form, attendees: [...existing, v].filter(Boolean).join(', ') });
                        }
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Add team members…" /></SelectTrigger>
                      <SelectContent>
                        {members.map(m => <SelectItem key={m.id} value={m.email}>{m.email}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input
                      value={form.attendees}
                      onChange={e => setForm({ ...form, attendees: e.target.value })}
                      placeholder="Or type emails separated by commas"
                    />
                  </div>

                  <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
                    <p className="text-sm font-medium">Associate with records <span className="text-muted-foreground font-normal text-xs">(optional)</span></p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1 text-xs"><UserPlus className="h-3.5 w-3.5" /> Lead</Label>
                        <Select value={form.lead_id || '__none__'} onValueChange={v => setForm({ ...form, lead_id: v === '__none__' ? '' : v })}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">None</SelectItem>
                            {leads.map(l => <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1 text-xs"><Users className="h-3.5 w-3.5" /> Contact</Label>
                        <Select value={form.contact_id || '__none__'} onValueChange={v => setForm({ ...form, contact_id: v === '__none__' ? '' : v })}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">None</SelectItem>
                            {contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="flex items-center gap-1 text-xs"><Building2 className="h-3.5 w-3.5" /> Company</Label>
                        <Select value={form.company_id || '__none__'} onValueChange={v => setForm({ ...form, company_id: v === '__none__' ? '' : v })}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">None</SelectItem>
                            {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Brief meeting context" />
                  </div>
                  <div className="space-y-2">
                    <Label>Agenda</Label>
                    <Textarea value={form.agenda} onChange={e => setForm({ ...form, agenda: e.target.value })} rows={3} placeholder="Topics to cover, questions to ask…" />
                  </div>
                  <div className="space-y-2">
                    <Label>Meeting Notes</Label>
                    <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="Outcomes, action items, follow-ups…" />
                  </div>

                  <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-4 py-2.5 flex items-start gap-2">
                    <span className="text-indigo-500 mt-0.5 text-sm">✦</span>
                    <p className="text-xs text-indigo-700">
                      This meeting will automatically appear as a <strong>Meeting-type activity</strong> in the Activities tab, keeping both in sync.
                    </p>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancel</Button>
                    <Button type="submit">
                      {editingMeeting ? 'Update Meeting' : 'Schedule Meeting'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* ── Calendar View ─────────────────────────────────────────────────── */}
      {viewMode === 'calendar' && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <Button variant="ghost" size="sm" className="hover:bg-indigo-50 hover:text-indigo-600"
              onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="font-semibold">{format(calendarMonth, 'MMMM yyyy')}</h2>
            <Button variant="ghost" size="sm" className="hover:bg-indigo-50 hover:text-indigo-600"
              onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-7 border-b">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {calendarDays.map(day => (
              <CalendarCell
                key={day.toISOString()}
                day={day}
                meetings={meetings}
                currentMonth={calendarMonth}
                onSelect={m => { setSelectedMeeting(m); setDetailOpen(true); }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── List View ─────────────────────────────────────────────────────── */}
      {viewMode === 'list' && (
        <>
          <div className="space-y-4 md:hidden">
            {meetings.map(meeting => {
              const ModeIcon = modeIcons[meeting.mode];
              return (
                <MobileCard
                  key={meeting.id}
                  title={<span className="flex items-center gap-2"><ModeIcon className="h-4 w-4 shrink-0" />{meeting.title}</span>}
                  badge={
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${typeColors[meeting.meeting_type]}`}>
                      {typeLabels[meeting.meeting_type]}
                    </span>
                  }
                  details={[
                    { label: 'Status', value: <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColors[meeting.status]}`}>{meeting.status.replace('_',' ')}</span> },
                    { label: 'When',   value: meeting.start_time ? format(parseISO(meeting.start_time), 'MMM d, yyyy h:mm a') : '—' },
                    { label: 'Lead',    value: meeting.lead_name    || null },
                    { label: 'Contact', value: meeting.contact_name || null },
                    { label: 'Company', value: meeting.company_name || null },
                  ].filter(d => d.value)}
                  actions={
                    <>
                      <Button size="sm" variant="outline" onClick={() => { setSelectedMeeting(meeting); setDetailOpen(true); }}>View</Button>
                      {canManage && (
                        <>
                          <Button size="sm" variant="ghost" className="hover:bg-indigo-50 hover:text-indigo-600" onClick={() => handleEdit(meeting)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="hover:bg-red-50 hover:text-red-500" onClick={() => handleDelete(meeting)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </>
                  }
                />
              );
            })}
          </div>
          <div className="hidden md:block">
            <DataTable
              columns={columns}
              data={meetings}
              emptyIcon={Calendar}
              emptyTitle="No meetings yet"
              emptyDescription="Schedule your first meeting to get started."
              emptyActionLabel={canManage ? 'Schedule a meeting' : undefined}
              onEmptyAction={canManage ? () => setDialogOpen(true) : undefined}
            />
          </div>
        </>
      )}

      {/* ── Detail Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          {selectedMeeting && (() => {
            const m = selectedMeeting;
            const ModeIcon = modeIcons[m.mode];
            const accent = typeAccents[m.meeting_type];
            return (
              <>
                <DialogHeader>
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg" style={{ backgroundColor: `${accent}18` }}>
                      <ModeIcon className="h-5 w-5" style={{ color: accent }} />
                    </div>
                    <div className="flex-1">
                      <DialogTitle className="text-left flex items-center gap-2">
                        {m.title}
                        {m.linked_activity_id && (
                          <span className="inline-flex items-center rounded-full bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200 px-1.5 py-0.5 text-[10px] font-medium">
                            ↔ synced to activity
                          </span>
                        )}
                      </DialogTitle>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${typeColors[m.meeting_type]}`}>{typeLabels[m.meeting_type]}</span>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColors[m.status]}`}>{m.status.replace('_',' ')}</span>
                      </div>
                    </div>
                  </div>
                </DialogHeader>

                <div className="space-y-4 mt-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>
                      {m.start_time ? format(parseISO(m.start_time), 'EEEE, MMM d yyyy · h:mm a') : '—'}
                      {m.end_time && ` – ${format(parseISO(m.end_time), 'h:mm a')}`}
                    </span>
                  </div>

                  {(m.video_link || m.location) && (
                    <div className="flex items-center gap-2 text-sm">
                      {m.video_link
                        ? <><Video className="h-4 w-4 text-muted-foreground shrink-0" /><a href={m.video_link} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline truncate">{m.video_link}</a></>
                        : <><MapPin className="h-4 w-4 text-muted-foreground shrink-0" /><span>{m.location}</span></>
                      }
                    </div>
                  )}

                  {m.attendees && (
                    <div className="flex items-start gap-2 text-sm">
                      <Users className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="flex flex-wrap gap-1">
                        {m.attendees.split(',').map(a => (
                          <span key={a} className="bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 px-2 py-0.5 rounded-full text-xs font-medium">{a.trim()}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {(m.lead_name || m.contact_name || m.company_name) && (
                    <div className="flex flex-col gap-1 text-sm">
                      {m.lead_name    && <span className="flex items-center gap-1 text-muted-foreground"><UserPlus  className="h-3.5 w-3.5" />{m.lead_name}</span>}
                      {m.contact_name && <span className="flex items-center gap-1 text-muted-foreground"><Users     className="h-3.5 w-3.5" />{m.contact_name}</span>}
                      {m.company_name && <span className="flex items-center gap-1 text-muted-foreground"><Building2 className="h-3.5 w-3.5" />{m.company_name}</span>}
                    </div>
                  )}

                  {m.description && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Description</p>
                      <p className="text-sm">{m.description}</p>
                    </div>
                  )}
                  {m.agenda && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Agenda</p>
                      <p className="text-sm whitespace-pre-wrap bg-muted/30 rounded-lg p-3">{m.agenda}</p>
                    </div>
                  )}
                  {m.notes && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Meeting Notes</p>
                      <p className="text-sm whitespace-pre-wrap bg-muted/30 rounded-lg p-3">{m.notes}</p>
                    </div>
                  )}

                  {canManage && m.status === 'scheduled' && (
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" variant="outline" className="flex-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50" onClick={() => handleStatusChange(m, 'completed')}>
                        Mark Completed
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 text-amber-600 border-amber-200 hover:bg-amber-50" onClick={() => handleStatusChange(m, 'on_hold')}>
                        On Hold
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 hover:bg-slate-50" onClick={() => handleStatusChange(m, 'cancelled')}>
                        Cancel
                      </Button>
                    </div>
                  )}

                  {canManage && (
                    <div className="flex gap-2 pt-1">
                      <Button variant="outline" size="sm" className="flex-1 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200" onClick={() => handleEdit(m)}>
                        <Pencil className="h-4 w-4 mr-2" /> Edit
                      </Button>
                      <Button variant="outline" size="sm" className="hover:bg-red-50 hover:text-red-500 hover:border-red-200" onClick={() => handleDelete(m)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog />
    </div>
  );
}