import { useState, useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useConfirmDelete } from "@/hooks/useConfirmDelete";
import { logAudit } from "@/lib/audit";
import { PageLoader } from "@/components/PageLoader";
import { MobileCard } from "@/components/MobileCard";
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
import { Calendar, Plus, Trash2, Pencil } from "lucide-react";
import { format } from "date-fns";

interface Activity {
  id: string;
  type: "call" | "meeting" | "follow_up" | "email";
  title: string;
  description: string | null;
  status: "scheduled" | "completed" | "cancelled";
  due_date: string | null;
  lead_id: string | null;
  deal_id: string | null;
  created_by?: string | null;
  is_overdue?: boolean;
}

const TYPE_CFG: Record<string, { label: string; pill: string; dot: string }> = {
  call:      { label: 'Call',      pill: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',      dot: 'bg-sky-400' },
  meeting:   { label: 'Meeting',   pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',   dot: 'bg-amber-400' },
  follow_up: { label: 'Follow Up', pill: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200', dot: 'bg-violet-400' },
  email:     { label: 'Email',     pill: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',  dot: 'bg-slate-400' },
};

const STATUS_CFG: Record<string, { label: string; pill: string }> = {
  scheduled: { label: 'Scheduled', pill: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
  completed: { label: 'Completed', pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  cancelled: { label: 'Cancelled', pill: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200' },
};

const EMPTY_FORM = {
  type: "call" as Activity["type"],
  title: "",
  description: "",
  status: "scheduled" as Activity["status"],
  due_date: "",
};

export default function Activities() {
  const { user, role, profile } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeFilter = searchParams.get("filter");
  const { confirm, ConfirmDeleteDialog } = useConfirmDelete();

  const canManage = role === "admin" || role === "manager";
  const canAdd = role === "admin" || role === "manager" || role === "user";
  const canExport = role === "admin";
  const isOwn = (a: Activity) => role === "user" && a.created_by === user?.id;

  const leadId = (location.state as any)?.leadId ?? null;
  const dealId = (location.state as any)?.dealId ?? null;

  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAct, setEditingAct] = useState<Activity | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);

  useEffect(() => { if (leadId || dealId) setIsDialogOpen(true); }, [leadId, dealId]);

  const fetchActivities = async () => {
    if (!user) return;
    let query = supabase.from("activities").select("id, type, title, description, status, due_date, lead_id, deal_id, created_by").order("due_date", { ascending: true });
    if (role === "user") query = query.eq("created_by", user.id);
    const { data, error } = await query.returns<Activity[]>();
    if (error) { toast({ variant: "destructive", title: "Error", description: error.message }); setLoading(false); return; }
    setActivities((data ?? []).map(a => ({ ...a, is_overdue: a.status === "scheduled" && a.due_date !== null && new Date(a.due_date) < new Date() })));
    setLoading(false);
  };

  useEffect(() => { fetchActivities(); }, [user, role]);

  const filteredActivities = activeFilter === "overdue" ? activities.filter(a => a.is_overdue) : activities;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAdd) { toast({ variant: "destructive", title: "Permission denied" }); return; }
    if (role === "user" && editingAct && editingAct.created_by !== user?.id) { toast({ variant: "destructive", title: "Permission denied" }); return; }
    const payload = { type: formData.type, title: formData.title, description: formData.description || null, status: formData.status, due_date: formData.due_date || null };
    if (editingAct) {
      const { error } = await supabase.from("activities").update(payload).eq("id", editingAct.id);
      if (error) { toast({ variant: "destructive", title: "Error", description: error.message }); return; }
      toast({ title: "Activity updated" });
    } else {
      const { error } = await supabase.from("activities").insert({ ...payload, lead_id: leadId, deal_id: dealId, created_by: user?.id });
      if (error) { toast({ variant: "destructive", title: "Error", description: error.message }); return; }
      toast({ title: "Activity created" });
    }
    setIsDialogOpen(false); resetForm(); fetchActivities();
  };

  const resetForm = () => { setFormData(EMPTY_FORM); setEditingAct(null); };

  const handleEdit = (a: Activity) => {
    setEditingAct(a);
    setFormData({ type: a.type, title: a.title, description: a.description ?? "", status: a.status, due_date: a.due_date ? a.due_date.slice(0, 16) : "" });
    setIsDialogOpen(true);
  };

  const toggleStatus = async (a: Activity) => {
    const newStatus = a.status === "completed" ? "scheduled" : "completed";
    const { error } = await supabase.from("activities").update({ status: newStatus }).eq("id", a.id);
    if (error) { toast({ variant: "destructive", title: "Error", description: error.message }); return; }
    fetchActivities();
  };

  const handleDelete = (a: Activity) => {
    confirm({
      title: `Delete "${a.title}"?`,
      description: "This action cannot be undone.",
      onConfirm: async () => {
        const { error } = await supabase.from("activities").delete().eq("id", a.id);
        if (error) { toast({ variant: "destructive", title: "Error", description: error.message }); return; }
        toast({ title: "Activity deleted" }); fetchActivities();
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

  const columns = [
    { key: "title", header: "Title", render: (a: Activity) => <span className="font-medium text-slate-800">{a.title}</span> },
    {
      key: "description", header: "Description",
      render: (a: Activity) => a.description ? <span className="line-clamp-2 max-w-[280px] block text-muted-foreground text-sm">{a.description}</span> : "—",
    },
    {
      key: "type", header: "Type",
      render: (a: Activity) => {
        const cfg = TYPE_CFG[a.type];
        return (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.pill}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
          </span>
        );
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
      key: "actions", header: "Actions",
      render: (a: Activity) => (
        <div className="flex items-center gap-1">
          {(canManage || isOwn(a)) && (
            <Button size="sm" variant="outline" className="hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 transition-colors" onClick={() => toggleStatus(a)}>
              {a.status === "completed" ? "Mark incomplete" : "Mark complete"}
            </Button>
          )}
          {canManage && (
            <>
              <button onClick={() => handleEdit(a)} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
              <button onClick={() => handleDelete(a)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
            </>
          )}
          {isOwn(a) && (
            <>
              <button onClick={() => handleEdit(a)} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
              <button onClick={() => handleDelete(a)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
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
          <h1 className="page-title">
            Activities
            {activeFilter === "overdue" && <span className="ml-2 text-sm font-normal text-muted-foreground">— overdue filter active</span>}
          </h1>
          <p className="text-muted-foreground mt-1">Track calls, meetings, and follow-ups</p>
        </div>
        <div className="flex items-center gap-2">
          {canExport && <ExportDropdown onExport={handleExport} />}
          {canAdd && (
            <Dialog open={isDialogOpen} onOpenChange={o => { setIsDialogOpen(o); if (!o) resetForm(); }}>
<Button onClick={() => setIsDialogOpen(true)}>
  <Plus className="h-4 w-4 mr-2" /> Add Activity
</Button>
              <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>{editingAct ? "Edit Activity" : "Add New Activity"}</DialogTitle></DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <Label>Title <span className="text-destructive">*</span></Label>
                    <Input value={formData.title} onChange={e => setFormData(f => ({ ...f, title: e.target.value }))} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input placeholder="Add notes or details" value={formData.description} onChange={e => setFormData(f => ({ ...f, description: e.target.value }))} />
                  </div>
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
                    <Label>Due date</Label>
                    <Input type="datetime-local" value={formData.due_date} onChange={e => setFormData(f => ({ ...f, due_date: e.target.value }))} />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>Cancel</Button>
                    <Button type="submit">{editingAct ? "Update Activity" : "Create Activity"}</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="hidden md:block">
        <DataTable columns={columns} data={filteredActivities} emptyIcon={Calendar} emptyTitle="No activities yet" emptyDescription="Start tracking your calls, meetings, and follow-ups." emptyActionLabel="Add your first activity" onEmptyAction={() => setIsDialogOpen(true)} />
      </div>

      <div className="space-y-4 md:hidden">
        {filteredActivities.map(a => {
          const tcfg = TYPE_CFG[a.type];
          const scfg = STATUS_CFG[a.status];
          return (
            <MobileCard
              key={a.id}
              title={a.title}
              badge={
                <div className="flex gap-1">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tcfg.pill}`}><span className={`h-1.5 w-1.5 rounded-full ${tcfg.dot}`} />{tcfg.label}</span>
                  {a.is_overdue && <span className="inline-flex items-center rounded-full bg-red-50 text-red-600 ring-1 ring-red-200 px-2.5 py-0.5 text-xs font-semibold">Overdue</span>}
                </div>
              }
              details={[
                { label: "Status", value: <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${scfg.pill}`}>{scfg.label}</span> },
                { label: "Due date", value: a.due_date ? new Date(a.due_date).toLocaleDateString() : "—" },
                { label: "Description", value: a.description },
              ]}
              actions={
                <>
                  {(canManage || isOwn(a)) && (
                    <Button size="sm" variant="outline" className="hover:bg-emerald-50 hover:text-emerald-700" onClick={() => toggleStatus(a)}>
                      {a.status === "completed" ? "Mark incomplete" : "Mark complete"}
                    </Button>
                  )}
                  {canManage && (
                    <>
                      <button onClick={() => handleEdit(a)} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => handleDelete(a)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"><Trash2 className="h-4 w-4" /></button>
                    </>
                  )}
                  {isOwn(a) && (
                    <>
                      <button onClick={() => handleEdit(a)} className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => handleDelete(a)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"><Trash2 className="h-4 w-4" /></button>
                    </>
                  )}
                </>
              }
            />
          );
        })}
      </div>
      <ConfirmDeleteDialog />
    </div>
  );
}