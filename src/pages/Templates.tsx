import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirmDelete } from '@/hooks/useConfirmDelete';
import { PageLoader } from '@/components/PageLoader';
import { MobileCard } from '@/components/MobileCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataTable } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Mail, Plus, Trash2, Pencil, BookOpen, Check, ChevronRight } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

interface Template {
  id: string;
  name: string;
  subject: string | null;
  body: string;
  category: string | null;
}

const LIBRARY_SECTIONS = [
  {
    section: 'First Touch',
    templates: [
      {
        name: 'Share a Helpful Resource',
        subject: '{{Contact.FirstName}}, thought you\'d find this interesting',
        category: 'introduction',
        body: `Hi {{Contact.FirstName}},

Your recent work on [INSERT TOPIC] got me thinking — I came across this article that may be useful as you scale.

[INSERT ARTICLE TITLE & LINK]

Happy to jump on a quick call if you'd like to discuss. No pressure at all.

Best,
{{Sender.Name}}`,
      },
      {
        name: 'Cold Outreach — Pain Point',
        subject: 'Quick question about {{Company.Name}}\'s [PROCESS]',
        category: 'introduction',
        body: `Hi {{Contact.FirstName}},

I noticed that many [INDUSTRY] companies struggle with [PAIN POINT]. We've helped similar teams cut [METRIC] by [X]%.

Would it make sense to connect for 15 minutes to see if we could do the same for {{Company.Name}}?

{{Sender.Name}}`,
      },
      {
        name: 'Inbound Lead Welcome',
        subject: 'Great to connect, {{Contact.FirstName}}',
        category: 'introduction',
        body: `Hi {{Contact.FirstName}},

Thanks for reaching out — I've reviewed your inquiry about [TOPIC] and wanted to personally follow up.

I'd love to understand your goals better. Are you free for a 20-minute call this week?

Looking forward to it,
{{Sender.Name}}`,
      },
    ],
  },
  {
    section: 'Follow-Up',
    templates: [
      {
        name: 'Missed You on the Phone',
        subject: 'Sorry I missed you',
        category: 'follow_up',
        body: `Hi {{Contact.FirstName}},

Sorry I missed you on the call today — I was reaching out because [REASON].

I left a voicemail and mentioned I'd try again on [DATE] at [TIME]. Of course, feel free to reach me anytime at [YOUR NUMBER].

Looking forward to connecting,
{{Sender.Name}}`,
      },
      {
        name: 'Continue the Conversation',
        subject: 'Following up from our last chat',
        category: 'follow_up',
        body: `Hi {{Contact.FirstName}},

I wanted to follow up on our last conversation about [TOPIC].

Based on what you shared, I think [SPECIFIC SOLUTION/NEXT STEP] could really help. I've put together [RESOURCE/PROPOSAL/DEMO] for you.

Does [DAY] at [TIME] work for a quick catch-up?

{{Sender.Name}}`,
      },
      {
        name: '"Let\'s Put Something on the Calendar"',
        subject: 'Calendar in [MONTH]?',
        category: 'follow_up',
        body: `Hi {{Contact.FirstName}},

Rather than going back and forth over email, would it be easier to find a time on the calendar in [MONTH] for a quick call?

It'd only take 20 minutes and I think it'd be worth your time.

What does your calendar look like?

{{Sender.Name}}`,
      },
      {
        name: 'Prospect Missed the Meeting',
        subject: 'Sorry we missed each other',
        category: 'follow_up',
        body: `Hi {{Contact.FirstName}},

It looks like we missed each other today — no worries at all, I know how busy things get.

Would you like to reschedule? I'm flexible this week — [DAY/TIME 1] or [DAY/TIME 2] both work on my end.

{{Sender.Name}}`,
      },
    ],
  },
  {
    section: 'Proposal & Closing',
    templates: [
      {
        name: 'Send the Proposal',
        subject: 'Your proposal from Z IT Solutions',
        category: 'proposal',
        body: `Hi {{Contact.FirstName}},

As discussed, I've attached the proposal for [PROJECT/SERVICE]. It covers:

• [KEY POINT 1]
• [KEY POINT 2]
• [KEY POINT 3]

Please take a look and let me know if you have any questions or if you'd like to adjust anything. I'm happy to walk you through it on a call.

Looking forward to your thoughts,
{{Sender.Name}}`,
      },
      {
        name: '"What Would Need to Change?"',
        subject: 'Quick question about the proposal',
        category: 'proposal',
        body: `Hi {{Contact.FirstName}},

I wanted to check in — if there's something in the proposal that's giving you pause, I'd love to understand what would need to change to make it work for you.

No pressure — I just want to make sure we're on the same page.

{{Sender.Name}}`,
      },
      {
        name: 'The Breakup Email',
        subject: 'Should I close your file?',
        category: 'follow_up',
        body: `Hi {{Contact.FirstName}},

I've reached out a few times without hearing back — I completely understand if the timing isn't right.

I don't want to keep cluttering your inbox, so I'll take this as a "not now" and close out your file. If things change and you'd like to revisit, I'm always here.

Wishing you all the best,
{{Sender.Name}}`,
      },
    ],
  },
  {
    section: 'Post-Sale & Support',
    templates: [
      {
        name: 'Thank You for Choosing Us',
        subject: 'Welcome to Z IT Solutions, {{Contact.FirstName}}!',
        category: 'thank_you',
        body: `Hi {{Contact.FirstName}},

Welcome aboard! We're thrilled to have {{Company.Name}} as a client.

Here's what happens next:
1. [ONBOARDING STEP 1]
2. [ONBOARDING STEP 2]
3. [ONBOARDING STEP 3]

Your dedicated point of contact is [NAME] and you can reach them at [EMAIL/PHONE].

Excited to get started,
{{Sender.Name}}`,
      },
      {
        name: 'Check-In After Onboarding',
        subject: 'How are things going, {{Contact.FirstName}}?',
        category: 'support',
        body: `Hi {{Contact.FirstName}},

It's been [X weeks] since we got started — I just wanted to check in and see how things are going.

Is everything running smoothly? Any questions or feedback for us?

We're always here if you need anything.

{{Sender.Name}}`,
      },
      {
        name: 'Request a Referral',
        subject: 'A quick favour, {{Contact.FirstName}}',
        category: 'thank_you',
        body: `Hi {{Contact.FirstName}},

I'm so glad things are going well with [SERVICE/PROJECT].

If you know anyone else who might benefit from what we do, I'd really appreciate an introduction. Even just a mention means a lot.

Of course, feel free to share my contact details directly.

Thanks so much,
{{Sender.Name}}`,
      },
    ],
  },
];

const categoryOptions = [
  { value: 'sales',        label: 'Sales',        color: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200' },
  { value: 'follow_up',    label: 'Follow Up',    color: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
  { value: 'introduction', label: 'Introduction', color: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200' },
  { value: 'proposal',     label: 'Proposal',     color: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200' },
  { value: 'thank_you',    label: 'Thank You',    color: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  { value: 'support',      label: 'Support',      color: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200' },
];

const categoryLabel = (v: string | null) =>
  categoryOptions.find(o => o.value === v)?.label ?? v ?? '—';

const categoryColor = (v: string | null) =>
  categoryOptions.find(o => o.value === v)?.color ?? 'bg-slate-100 text-slate-600 ring-1 ring-slate-200';

export default function Templates() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const { confirm, ConfirmDeleteDialog } = useConfirmDelete();

  const canManage = role === 'admin' || role === 'manager';

  const [templates, setTemplates]         = useState<Template[]>([]);
  const [loading, setLoading]             = useState(true);
  const [isDialogOpen, setIsDialogOpen]   = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [showOtherCategory, setShowOtherCategory] = useState(false);

  const [libraryPreview, setLibraryPreview] = useState<(typeof LIBRARY_SECTIONS[0]['templates'][0]) | null>(
    LIBRARY_SECTIONS[0].templates[0]
  );
  const [importingIds, setImportingIds] = useState<Set<string>>(new Set());
  const [importedNames, setImportedNames] = useState<Set<string>>(new Set());

  const [formData, setFormData] = useState({
    name: '', subject: '', body: '', category: '',
  });

  const fetchTemplates = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('outreach_templates')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } else {
      setTemplates(data || []);
      const existing = new Set((data || []).map(t => t.name));
      setImportedNames(existing);
      const customs = (data || [])
        .map(t => t.category)
        .filter(c => c && !categoryOptions.some(o => o.value === c)) as string[];
      setCustomCategories([...new Set(customs)]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchTemplates(); }, [user]);

  const resetForm = () => {
    setFormData({ name: '', subject: '', body: '', category: '' });
    setEditingTemplate(null);
    setShowOtherCategory(false);
  };

  const handleCopyTemplate = async (template: Template) => {
    const content = `Subject: ${template.subject ?? ''}\nCategory: ${template.category ?? ''}\n\n${template.body}`.trim();
    try {
      await navigator.clipboard.writeText(content);
      toast({ title: 'Copied to clipboard' });
    } catch {
      toast({ variant: 'destructive', title: 'Copy failed' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: formData.name,
      subject: formData.subject || null,
      body: formData.body,
      category: formData.category || null,
    };

    if (editingTemplate) {
      const { error } = await supabase.from('outreach_templates').update(payload).eq('id', editingTemplate.id);
      if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
      toast({ title: 'Template updated' });
    } else {
      const { error } = await supabase.from('outreach_templates').insert({ ...payload, created_by: user?.id });
      if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
      toast({ title: 'Template created' });
    }
    setIsDialogOpen(false);
    resetForm();
    fetchTemplates();
  };

  const handleImport = async (tpl: typeof LIBRARY_SECTIONS[0]['templates'][0]) => {
    const key = tpl.name;
    if (importedNames.has(key)) return;
    setImportingIds(prev => new Set(prev).add(key));

    const { error } = await supabase.from('outreach_templates').insert({
      name: tpl.name,
      subject: tpl.subject,
      body: tpl.body,
      category: tpl.category,
      created_by: user?.id,
    });

    setImportingIds(prev => { const s = new Set(prev); s.delete(key); return s; });

    if (error) {
      toast({ variant: 'destructive', title: 'Import failed', description: error.message });
    } else {
      setImportedNames(prev => new Set(prev).add(key));
      toast({ title: `"${tpl.name}" added to your templates` });
      fetchTemplates();
    }
  };

  const handleImportAll = async (section: typeof LIBRARY_SECTIONS[0]) => {
    for (const tpl of section.templates) {
      if (!importedNames.has(tpl.name)) await handleImport(tpl);
    }
  };

  const handleEdit = (template: Template) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      subject: template.subject || '',
      body: template.body,
      category: template.category || '',
    });
    const isCustom = template.category && !categoryOptions.some(o => o.value === template.category);
    setShowOtherCategory(!!isCustom);
    setIsDialogOpen(true);
  };

  const handleDelete = (template: Template) => {
    confirm({
      title: `Delete "${template.name}"?`,
      description: 'This action cannot be undone.',
      onConfirm: async () => {
        const { error } = await supabase.from('outreach_templates').delete().eq('id', template.id);
        if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
        toast({ title: 'Template deleted' });
        fetchTemplates();
      },
    });
  };

  const allCategoryOptions = [
    ...categoryOptions,
    ...customCategories.map(c => ({ value: c, label: c, color: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' })),
  ];

  const handleCategoryChange = (value: string) => {
    if (value === '__other__') {
      setShowOtherCategory(true);
      setFormData({ ...formData, category: '' });
    } else {
      setShowOtherCategory(false);
      setFormData({ ...formData, category: value });
    }
  };

  const columns = useMemo(() => [
    {
      key: 'name', header: 'Name',
      render: (t: Template) => <span className="font-semibold text-slate-900">{t.name}</span>,
    },
    { key: 'subject', header: 'Subject', render: (t: Template) => t.subject || '—' },
    {
      key: 'category', header: 'Category',
      render: (t: Template) => t.category
        ? <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${categoryColor(t.category)}`}>{categoryLabel(t.category)}</span>
        : '—',
    },
    {
      key: 'body', header: 'Preview',
      render: (t: Template) => (
        <span className="text-muted-foreground truncate max-w-xs block text-sm">
          {t.body.substring(0, 60)}…
        </span>
      ),
    },
    {
      key: 'actions', header: 'Actions',
      render: (template: Template) => (
        <div className="flex items-center gap-1">
          {canManage && (
            <>
              <Button variant="ghost" size="sm" className="hover:bg-indigo-50 hover:text-indigo-600 transition-colors" onClick={e => { e.stopPropagation(); handleEdit(template); }}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="hover:bg-red-50 hover:text-red-500 transition-colors" onClick={e => { e.stopPropagation(); handleDelete(template); }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" className="hover:bg-sky-50 hover:text-sky-600 transition-colors" onClick={e => { e.stopPropagation(); handleCopyTemplate(template); }}>
            <Mail className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ], [canManage, role]);

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Outreach Templates</h1>
          <p className="text-muted-foreground mt-1">Create and reuse message templates</p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" className="hover:bg-violet-50 hover:text-violet-600 hover:border-violet-200 transition-colors" onClick={() => setIsLibraryOpen(true)}>
            <BookOpen className="h-4 w-4 mr-2" />
            Template Library
          </Button>

          {canManage && (
            <Dialog open={isDialogOpen} onOpenChange={open => { setIsDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
<Button>
  <Plus className="h-4 w-4 mr-2" /> New Template
</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{editingTemplate ? 'Edit Template' : 'New Template'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <Label>Template Name <span className="text-destructive">*</span></Label>
                    <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    {!showOtherCategory ? (
                      <Select value={formData.category} onValueChange={handleCategoryChange}>
                        <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                        <SelectContent>
                          {allCategoryOptions.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                          <SelectItem value="__other__" className="text-muted-foreground">Other…</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex gap-2">
                        <Input value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} placeholder="Custom category…" className="flex-1" />
                        <Button type="button" variant="ghost" size="sm" onClick={() => { setShowOtherCategory(false); setFormData({ ...formData, category: '' }); }}>Cancel</Button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Subject Line</Label>
                    <Input value={formData.subject} onChange={e => setFormData({ ...formData, subject: e.target.value })} placeholder="Use {{Contact.FirstName}}, {{Company.Name}} etc." />
                  </div>
                  <div className="space-y-2">
                    <Label>Message Body <span className="text-destructive">*</span></Label>
                    <Textarea value={formData.body} onChange={e => setFormData({ ...formData, body: e.target.value })} rows={9} required placeholder="Use {{Contact.FirstName}}, {{Sender.Name}}, {{Company.Name}}…" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Available tokens: <code className="bg-muted px-1 rounded">{'{{Contact.FirstName}}'}</code> <code className="bg-muted px-1 rounded">{'{{Company.Name}}'}</code> <code className="bg-muted px-1 rounded">{'{{Sender.Name}}'}</code>
                  </p>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>Cancel</Button>
                    <Button type="submit">
                      {editingTemplate ? 'Update' : 'Create'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <Dialog open={isLibraryOpen} onOpenChange={setIsLibraryOpen}>
        <DialogContent className="max-w-5xl h-[80vh] p-0 flex flex-col overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle className="text-xl">Template Library</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Browse ready-made templates and import them into your collection with one click.
            </p>
          </DialogHeader>

          <div className="flex flex-1 overflow-hidden">
            <div className="w-80 shrink-0 border-r overflow-y-auto">
              {LIBRARY_SECTIONS.map(section => (
                <div key={section.section}>
                  <div className="px-4 py-2 flex items-center justify-between sticky top-0 bg-muted/80 backdrop-blur border-b">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {section.section}
                    </span>
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs px-2 hover:bg-indigo-50 hover:text-indigo-600"
                        onClick={() => handleImportAll(section)}
                      >
                        Import all
                      </Button>
                    )}
                  </div>

                  {section.templates.map(tpl => {
                    const imported = importedNames.has(tpl.name);
                    const importing = importingIds.has(tpl.name);
                    const isActive = libraryPreview?.name === tpl.name;

                    return (
                      <button
                        key={tpl.name}
                        onClick={() => setLibraryPreview(tpl)}
                        className={`w-full text-left px-4 py-3 border-b hover:bg-indigo-50/50 transition-colors flex items-start justify-between gap-2 ${isActive ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : ''}`}
                      >
                        <div className="min-w-0">
                          <p className={`text-sm font-medium truncate ${imported ? 'text-muted-foreground' : 'text-slate-800'}`}>{tpl.name}</p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{tpl.subject}</p>
                        </div>
                        <div className="shrink-0 mt-0.5">
                          {imported
                            ? <Check className="h-4 w-4 text-emerald-500" />
                            : <ChevronRight className={`h-4 w-4 ${isActive ? 'text-indigo-500' : 'text-muted-foreground opacity-40'}`} />
                          }
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
              {libraryPreview ? (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">{libraryPreview.name}</h3>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${categoryColor(libraryPreview.category)}`}>
                          {categoryLabel(libraryPreview.category)}
                        </span>
                        <span className="text-xs text-muted-foreground">Subject: {libraryPreview.subject}</span>
                      </div>
                    </div>
                    {canManage && (
                      <Button
                        onClick={() => handleImport(libraryPreview)}
                        disabled={importedNames.has(libraryPreview.name) || importingIds.has(libraryPreview.name)}
                        size="sm"
                        className="shrink-0"
                      >
                        {importedNames.has(libraryPreview.name)
                          ? <><Check className="h-4 w-4 mr-1" /> Added</>
                          : importingIds.has(libraryPreview.name)
                          ? 'Adding…'
                          : <><Plus className="h-4 w-4 mr-1" /> Use this template</>
                        }
                      </Button>
                    )}
                  </div>

                  <div className="bg-slate-50 rounded-xl border border-slate-200/80 p-5 font-mono text-sm leading-relaxed whitespace-pre-wrap text-slate-800">
                    {libraryPreview.body}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Tokens like <code className="bg-muted px-1 rounded">{'{{Contact.FirstName}}'}</code> are placeholders — replace them before sending.
                  </p>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                  Select a template on the left to preview it.
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-4 md:hidden">
        {templates.map(template => (
          <MobileCard
            key={template.id}
            title={template.name}
            badge={template.category ? <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${categoryColor(template.category)}`}>{categoryLabel(template.category)}</span> : undefined}
            details={[
              { label: 'Subject',  value: template.subject || '—' },
              { label: 'Preview',  value: template.body.substring(0, 80) + '…' },
            ]}
            actions={
              <>
                <Button size="sm" variant="outline" className="w-full hover:bg-sky-50 hover:text-sky-600 hover:border-sky-200" onClick={() => handleCopyTemplate(template)}>
                  <Mail className="h-4 w-4 mr-2" />Copy
                </Button>
                {canManage && (
                  <>
                    <Button size="sm" variant="ghost" className="hover:bg-indigo-50 hover:text-indigo-600" onClick={() => handleEdit(template)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" className="hover:bg-red-50 hover:text-red-500" onClick={() => handleDelete(template)}><Trash2 className="h-4 w-4" /></Button>
                  </>
                )}
              </>
            }
          />
        ))}
      </div>

      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={templates}
          emptyIcon={Mail}
          emptyTitle="No templates yet"
          emptyDescription='Browse the Template Library or create your own.'
          emptyActionLabel="Browse library"
          onEmptyAction={() => setIsLibraryOpen(true)}
        />
      </div>

      <ConfirmDeleteDialog />
    </div>
  );
}