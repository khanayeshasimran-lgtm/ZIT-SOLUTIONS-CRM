import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useConfirmDelete } from "@/hooks/useConfirmDelete";
import { logAudit } from "@/lib/audit";
import { PageLoader } from "@/components/PageLoader";
import { MobileCard } from "@/components/MobileCard";
import { PaginationControls } from "@/components/PaginationControls";
import { usePagination } from "@/hooks/usePagination";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable } from "@/components/ui/DataTable";
import { ExportDropdown } from "@/components/ExportDropdown";
import { exportToCSV, exportToExcel, exportToPDF } from "@/utils/export";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Calendar, Plus, Trash2, Pencil, UserPlus, Briefcase,
  Lightbulb, MailOpen, MousePointerClick, X,
} from "lucide-react";
import {
  fetchActivities, createActivity, updateActivity, deleteActivity,
  toggleActivityStatus, syncActivityToMeeting,
  type Activity, type ActivityInput,
} from "@/services/activities.service";

// ── Config ────────────────────────────────────────────────────────────────────

const TYPE_CFG: Record<string, { label: string; pill: string; dot: string }> = {
  call:      { label: "Call",      pill: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",         dot: "bg-sky-400"    },
  meeting:   { label: "Meeting",   pill: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",    dot: "bg-amber-400"  },
  follow_up: { label: "Follow Up", pill: "bg-violet-50 text-violet-700 ring-1 ring-violet-200", dot: "bg-violet-400" },
  email:     { label: "Email",     pill: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",   dot: "bg-slate-400"  },
};

const STATUS_CFG: Record<string, { label: string; pill: string }> = {
  scheduled: { label: "Scheduled", pill: "bg-blue-50 text-blue-700 ring-1 ring-blue-200"       },
  completed: { label: "Completed", pill: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
  cancelled: { label: "Cancelled", pill: "bg-slate-100 text-slate-500 ring-1 ring-slate-200"   },
};

const EMPTY_FORM = {
  type:        "call" as Activity["type"],
  title:       "",
  description: "",
  status:      "scheduled" as Activity["status"],
  due_date:    "",
  lead_id:     "",
  deal_id:     "",
};

// ── Next-best-action ──────────────────────────────────────────────────────────

interface Suggestion { text: string; color: string }

function getNextBestAction(a: Activity): Suggestion | null {
  if (!a.is_overdue) return null;
  const days = a.due_date
    ? Math.floor((Date.now() - new Date(a.due_date).getTime()) / 86_400_000)
    : 0;
  if (a.type === "call"      && days >= 3) return { text: "Try email — calls unanswered",          color: "text-violet-700 bg-violet-50 ring-violet-200" };
  if (a.type === "email"     && days >= 2) return { text: "Follow up with a call",                 color: "text-sky-700 bg-sky-50 ring-sky-200"          };
  if (a.type === "follow_up" && days >= 1) return { text: "Re-qualify — may have gone cold",       color: "text-amber-700 bg-amber-50 ring-amber-200"    };
  if (days >= 5)                           return { text: "Consider closing — no response in 5d",  color: "text-slate-600 bg-slate-100 ring-slate-200"   };
  return null;
}

function SuggestionChip({ s, onDismiss }: { s: Suggestion; onDismiss: () => void }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full ring-1 ${s.color}`}>
      <Lightbulb className="h-2.5 w-2.5 shrink-0" />{s.text}
      <button onClick={onDismiss} className="ml-0.5 opacity-60 hover:opacity-100"><X className="h-2.5 w-2.5" /></button>
    </span>
  );
}

// ── Email tracking badge ──────────────────────────────────────────────────────

function EmailTrackingBadge({ opens, clicks }: { opens: number | null; clicks: number | null }) {
  if (opens === null && clicks === null) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1 text-xs text-slate-600 bg-slate-50 ring-1 ring-slate-200 rounded-full px-2 py-0.5">
        <MailOpen className="h-3 w-3" />{opens ?? 0}
      </span>
      <span className="inline-flex items-center gap-1 text-xs text-indigo-600 bg-indigo-50 ring-1 ring-indigo-200 rounded-full px-2 py-0.5">
        <MousePointerClick className="h-3 w-3" />{clicks ?? 0}
      </span>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Activities() {
  const { user, role, profile } = useAuth();
  const { toast }  = useToast();
  const location   = useLocation();
  const navigate   = useNavigate();
  const [searchParams] = useSearchParams();
  const activeFilter   = searchParams.get("filter");
  const { confirm, ConfirmDeleteDialog } = useConfirmDelete();
  const { canManage, canExport, isUser } = usePermissions("activities");

  const leadId = (location.state as any)?.leadId ?? null;
  const dealId = (location.state as any)?.dealId ?? null;

  const [activities,   setActivities]   = useState<Activity[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAct,   setEditingAct]   = useState<Activity | null>(null);
  const [formData,     setFormData]     = useState(EMPTY_FORM);
  const [leads,        setLeads]        = useState<{ id: string; label: string }[]>([]);
  const [deals,        setDeals]        = useState<{ id: string; label: string }[]>([]);
  const [dismissed,    setDismissed]    = useState<Record<string, boolean>>({});

  useEffect(() => { if (leadId || dealId) setIsDialogOpen(true); }, [leadId, dealId]);

  useEffect(() => {
    const run = async () => {
      const [{ data: ld }, { data: dd }] = await Promise.all([
        supabase.from("leads").select("id, name").order("name"),
        supabase.from("deals").select("id, title").order("title"),
      ]);
      setLeads((ld ?? []).map((l: any) => ({ id: l.id, label: l.name })));
      setDeals((dd ?? []).map((d: any) => ({ id: d.id, label: d.title })));
    };
    run();
  }, []);

  const loadActivities = useCallback(async () => {
    if (!user) return;
    try {
      const data = await fetchActivities(user.id, role ?? "user");
      setActivities(data);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setLoading(false);
    }
  }, [user, role]);

  useEffect(() => { loadActivities(); }, [loadActivities]);

  const filtered = activeFilter === "overdue" ? activities.filter(a => a.is_overdue) : activities;
  const { paginatedData: paged, paginationProps } = usePagination(filtered, 20);

  const resetForm = () => { setFormData(EMPTY_FORM); setEditingAct(null); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const input: ActivityInput = {
      type: formData.type, title: formData.title,
      description: formData.description || undefined,
      status: formData.status, due_date: formData.due_date || null,
      lead_id: formData.lead_id || null, deal_id: formData.deal_id || null,
    };
    try {
      if (editingAct) {
        const willBeMeeting = (input.type ?? editingAct.type) === "meeting";
        await updateActivity(editingAct.id, input, editingAct);
        if (willBeMeeting) {
          const mid = await syncActivityToMeeting(
            editingAct.id, input.title!, input.description || null,
            input.status!, input.due_date || null,
            editingAct.linked_meeting_id, user.id, input.lead_id
          );
          if (mid && mid !== editingAct.linked_meeting_id) {
            await (supabase as any).from("activities").update({ linked_meeting_id: mid }).eq("id", editingAct.id);
          }
        }
        logAudit({ userId: user.id, userEmail: profile?.email, action: "UPDATE", entity: "activities", entityId: editingAct.id });
        toast({ title: "Activity updated" });
      } else {
        await createActivity({ ...input, lead_id: input.lead_id || leadId || null, deal_id: input.deal_id || dealId || null }, user.id);
        logAudit({ userId: user.id, userEmail: profile?.email, action: "CREATE", entity: "activities" });
        toast({ title: "Activity created" });
      }
      setIsDialogOpen(false); resetForm(); loadActivities();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  };

  const handleEdit = (a: Activity) => {
    setEditingAct(a);
    setFormData({ type: a.type, title: a.title, description: a.description ?? "", status: a.status, due_date: a.due_date ? a.due_date.slice(0, 16) : "", lead_id: a.lead_id ?? "", deal_id: a.deal_id ?? "" });
    setIsDialogOpen(true);
  };

  const handleToggle = async (a: Activity) => {
    try {
      const s = await toggleActivityStatus(a);
      toast({ title: s === "completed" ? "Marked complete" : "Marked incomplete" });
      loadActivities();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  };

  const handleDelete = (a: Activity) => {
    confirm({
      title: `Delete "${a.title}"?`,
      description: a.linked_meeting_id ? "This will also remove the linked meeting." : "This cannot be undone.",
      onConfirm: async () => {
        try {
          await deleteActivity(a.id, a.linked_meeting_id);
          logAudit({ userId: user?.id, userEmail: profile?.email, action: "DELETE", entity: "activities", entityId: a.id });
          toast({ title: "Activity deleted" }); loadActivities();
        } catch (err: any) { toast({ variant: "destructive", title: "Error", description: err.message }); }
      },
    });
  };

  const handleExport = (type: "csv" | "excel" | "pdf") => {
    const rows = activities.map(a => ({ Title: a.title, Description: a.description ?? "", Type: a.type, Status: a.status, DueDate: a.due_date ?? "" }));
    if (type === "csv") exportToCSV("activities", rows);
    if (type === "excel") exportToExcel("activities", rows);
    if (type === "pdf") exportToPDF("activities", rows, { title: "ZIT Solutions – CRM", subtitle: "Activities Report", exportedBy: profile?.email ?? "System" });
    logAudit({ userId: user?.id, userEmail: profile?.email, action: "EXPORT", entity: "activities", entityId: `${type.toUpperCase()} (${rows.length} rows)` });
  };

  const canAct = (a: Activity) => canManage || (isUser && a.created_by === user?.id);

  const columns = [
    {
      key: "title", header: "Title",
      render: (a: Activity) => {
        const s = dismissed[a.id] ? null : getNextBestAction(a);
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-800">{a.title}</span>
              {a.linked_meeting_id && <span className="inline-flex items-center rounded-full bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200 px-1.5 py-0.5 text-[10px] font-medium">↔ synced</span>}
            </div>
            {s && <SuggestionChip s={s} onDismiss={() => setDismissed(d => ({ ...d, [a.id]: true }))} />}
          </div>
        );
      },
    },
    {
      key: "type", header: "Type",
      render: (a: Activity) => {
        const c = TYPE_CFG[a.type];
        return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.pill}`}><span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />{c.label}</span>;
      },
    },
    {
      key: "status", header: "Status",
      render: (a: Activity) => (
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CFG[a.status].pill}`}>{STATUS_CFG[a.status].label}</span>
          {a.is_overdue && <span className="inline-flex items-center rounded-full bg-red-50 text-red-600 ring-1 ring-red-200 px-2.5 py-0.5 text-xs font-semibold">Overdue</span>}
        </div>
      ),
    },
    {
      key: "due_date", header: "Due date",
      render: (a: Activity) => <span className={`text-sm ${a.is_overdue ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>{a.due_date ? new Date(a.due_date).toLocaleDateString() : "—"}</span>,
    },
    {
      key: "tracking", header: "Email tracking",
      render: (a: Activity) => a.type !== "email"
        ? <span className="text-xs text-muted-foreground">—</span>
        : <EmailTrackingBadge opens={(a as any).email_opens ?? null} clicks={(a as any).email_clicks ?? null} />,
    },
    {
      key: "actions", header: "Actions",
      render: (a: Activity) => (
        <div className="flex items-center gap-1">
          {canAct(a) && <Button size="sm" variant="outline" className="hover:bg-emerald-50 hover:text-emerald-700" onClick={() => handleToggle(a)}>{a.status === "completed" ? "Mark incomplete" : "Mark complete"}</Button>}
          {canAct(a) && <>
            <button onClick={() => handleEdit(a)} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"><Pencil className="h-3.5 w-3.5" /></button>
            <button onClick={() => handleDelete(a)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
          </>}
        </div>
      ),
    },
  ];

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Activities{activeFilter === "overdue" && <span className="ml-2 text-sm font-normal text-muted-foreground">— overdue filter active</span>}</h1>
          <p className="text-muted-foreground mt-1">Track calls, meetings, and follow-ups</p>
        </div>
        <div className="flex items-center gap-2">
          {canExport && <ExportDropdown onExport={handleExport} />}
          <Dialog open={isDialogOpen} onOpenChange={o => { setIsDialogOpen(o); if (!o) resetForm(); }}>
            <Button onClick={() => setIsDialogOpen(true)}><Plus className="h-4 w-4 mr-2" />Add Activity</Button>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>{editingAct ? "Edit Activity" : "Add New Activity"}</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2"><Label>Title <span className="text-destructive">*</span></Label><Input required value={formData.title} onChange={e => setFormData(f => ({ ...f, title: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Description</Label><Input placeholder="Add notes or details" value={formData.description} onChange={e => setFormData(f => ({ ...f, description: e.target.value }))} /></div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={formData.type} onValueChange={v => setFormData(f => ({ ...f, type: v as Activity["type"] }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="call">Call</SelectItem>
                      <SelectItem value="meeting">Meeting</SelectItem>
                      <SelectItem value="follow_up">Follow Up</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                    </SelectContent>
                  </Select>
                  {formData.type === "meeting" && <p className="text-xs text-indigo-600">✦ Automatically synced to the Meetings calendar</p>}
                  {editingAct?.type === "meeting" && formData.type !== "meeting" && editingAct.linked_meeting_id && <p className="text-xs text-amber-600">⚠ Changing type will unlink from the Meetings calendar.</p>}
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={formData.status} onValueChange={v => setFormData(f => ({ ...f, status: v as Activity["status"] }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Due date{formData.type === "meeting" && <span className="ml-1 text-xs text-muted-foreground">(used as meeting start time)</span>}</Label>
                  <Input type="datetime-local" value={formData.due_date} onChange={e => setFormData(f => ({ ...f, due_date: e.target.value }))} />
                </div>
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <p className="text-sm font-medium">Associate with <span className="text-muted-foreground font-normal">(optional)</span></p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1 text-xs"><UserPlus className="h-3.5 w-3.5" />Lead</Label>
                      <Select value={formData.lead_id || "__none__"} onValueChange={v => setFormData(f => ({ ...f, lead_id: v === "__none__" ? "" : v }))}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None</SelectItem>
                          {leads.map(l => <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1 text-xs"><Briefcase className="h-3.5 w-3.5" />Deal</Label>
                      <Select value={formData.deal_id || "__none__"} onValueChange={v => setFormData(f => ({ ...f, deal_id: v === "__none__" ? "" : v }))}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">None</SelectItem>
                          {deals.map(d => <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>Cancel</Button>
                  <Button type="submit">{editingAct ? "Update Activity" : "Create Activity"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="hidden md:block">
        <DataTable columns={columns} data={paged} emptyIcon={Calendar} emptyTitle="No activities yet" emptyDescription="Start tracking your calls, meetings, and follow-ups." emptyActionLabel="Add your first activity" onEmptyAction={() => setIsDialogOpen(true)} />
        <PaginationControls {...paginationProps} />
      </div>

      <div className="space-y-4 md:hidden">
        {paged.map(a => {
          const tc = TYPE_CFG[a.type];
          const sc = STATUS_CFG[a.status];
          const s  = dismissed[a.id] ? null : getNextBestAction(a);
          return (
            <MobileCard key={a.id}
              title={<span className="flex items-center gap-1.5">{a.title}{a.linked_meeting_id && <span className="inline-flex items-center rounded-full bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200 px-1.5 py-0.5 text-[10px] font-medium">↔</span>}</span>}
              badge={<div className="flex flex-col gap-1"><div className="flex gap-1"><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tc.pill}`}><span className={`h-1.5 w-1.5 rounded-full ${tc.dot}`} />{tc.label}</span>{a.is_overdue && <span className="inline-flex items-center rounded-full bg-red-50 text-red-600 ring-1 ring-red-200 px-2.5 py-0.5 text-xs font-semibold">Overdue</span>}</div>{s && <SuggestionChip s={s} onDismiss={() => setDismissed(d => ({ ...d, [a.id]: true }))} />}</div>}
              details={[
                { label: "Status", value: <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${sc.pill}`}>{sc.label}</span> },
                { label: "Due date", value: a.due_date ? new Date(a.due_date).toLocaleDateString() : "—" },
                { label: "Description", value: a.description },
              ]}
actions={
  <>
    {canAct(a) && (
      <Button
        size="sm"
        variant="outline"
        className="hover:bg-emerald-50 hover:text-emerald-700"
        onClick={() => handleToggle(a)}
      >
        {a.status === "completed" ? "Mark incomplete" : "Mark complete"}
      </Button>
    )}

    {canAct(a) && (
      <>
        <button
          onClick={() => handleEdit(a)}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
        >
          <Pencil className="h-4 w-4" />
        </button>

        <button
          onClick={() => handleDelete(a)}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </>
    )}
  </>
}
            />
          );
        })}
        <PaginationControls {...paginationProps} />
      </div>
      <ConfirmDeleteDialog />
    </div>
  );
}