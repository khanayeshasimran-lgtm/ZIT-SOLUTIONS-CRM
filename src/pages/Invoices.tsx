/**
 * pages/Invoices.tsx
 * Route: /invoices
 *
 * Changes vs previous version:
 *  - GST support: CGST+SGST (intra-state) or IGST (inter-state), GSTIN fields
 *  - HSN/SAC code per line item
 *  - INR / USD currency toggle
 *  - Razorpay payment link alongside Stripe (shown for INR invoices)
 *
 * DB MIGRATION at bottom of file.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirmDelete } from '@/hooks/useConfirmDelete';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/PaginationControls';
import { usePermissions } from '@/hooks/usePermissions';
import { PageLoader } from '@/components/PageLoader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { notifyPaymentDue } from '@/services/notifications.service';
import {
  FileText, Plus, Trash2, Pencil, Send, CheckCircle2,
  Clock, AlertCircle, Download, ExternalLink, Link,
  IndianRupee,
} from 'lucide-react';
import { format, addDays } from 'date-fns';
import { exportToPDF } from '@/utils/export';

// ── Types ─────────────────────────────────────────────────────────────────────

type InvoiceStatus  = 'draft' | 'sent' | 'paid' | 'overdue';
type Currency       = 'INR' | 'USD';
type GstType        = 'none' | 'igst' | 'cgst_sgst';

interface LineItem {
  description: string;
  hsn_sac:     string;
  qty:         number;
  rate:        number;
  amount:      number;
}

interface Invoice {
  id: string;
  invoice_number:      string;
  company_id:          string | null;
  project_id:          string | null;
  items:               LineItem[];
  currency:            Currency;
  subtotal:            number;
  tax_rate:            number;
  tax_amount:          number;
  total:               number;
  gst_type:            GstType;
  gstin:               string | null;   // seller GSTIN
  buyer_gstin:         string | null;
  status:              InvoiceStatus;
  due_date:            string | null;
  paid_at:             string | null;
  notes:               string | null;
  created_by:          string | null;
  created_at:          string;
  company_name?:       string | null;
  project_name?:       string | null;
  stripe_payment_link?:   string | null;
  stripe_session_id?:     string | null;
  razorpay_payment_link?: string | null;
  razorpay_payment_id?:   string | null;
}

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<InvoiceStatus, { label: string; pill: string; icon: React.ElementType }> = {
  draft:   { label: 'Draft',   pill: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',         icon: FileText     },
  sent:    { label: 'Sent',    pill: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',              icon: Send         },
  paid:    { label: 'Paid',    pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',     icon: CheckCircle2 },
  overdue: { label: 'Overdue', pill: 'bg-red-50 text-red-700 ring-1 ring-red-200',                 icon: AlertCircle  },
};

// GST rates commonly used in India
const GST_RATE_OPTIONS = [0, 5, 12, 18, 28];

function formatCurrency(v: number, currency: Currency = 'USD') {
  if (currency === 'INR') {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency: 'INR', minimumFractionDigits: 2,
    }).format(v);
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2,
  }).format(v);
}

function generateInvoiceNumber() {
  const now = new Date();
  return `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
}

// Validate GSTIN format (15 chars: 2 digit state, 10 PAN, 1 entity, Z, checksum)
function isValidGstin(gstin: string) {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin.toUpperCase());
}

// ── GST breakdown helper ──────────────────────────────────────────────────────

function computeGst(subtotal: number, taxRate: number, gstType: GstType) {
  const totalTax = subtotal * (taxRate / 100);
  if (gstType === 'cgst_sgst') {
    return {
      cgst: totalTax / 2,
      sgst: totalTax / 2,
      igst: 0,
      total: totalTax,
    };
  }
  if (gstType === 'igst') {
    return { cgst: 0, sgst: 0, igst: totalTax, total: totalTax };
  }
  return { cgst: 0, sgst: 0, igst: 0, total: totalTax };
}

// ── Line items editor ─────────────────────────────────────────────────────────

function LineItemsEditor({
  items, onChange, currency,
}: { items: LineItem[]; onChange: (items: LineItem[]) => void; currency: Currency }) {
  const add = () => onChange([...items, { description: '', hsn_sac: '', qty: 1, rate: 0, amount: 0 }]);

  const update = (i: number, field: keyof LineItem, val: string | number) => {
    const next = items.map((item, idx) => {
      if (idx !== i) return item;
      const updated = { ...item, [field]: val };
      updated.amount = Number(updated.qty) * Number(updated.rate);
      return updated;
    });
    onChange(next);
  };

  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1">
        <span className="col-span-4">Description</span>
        <span className="col-span-2">HSN/SAC</span>
        <span className="col-span-1 text-right">Qty</span>
        <span className="col-span-2 text-right">Rate</span>
        <span className="col-span-2 text-right">Amount</span>
        <span className="col-span-1" />
      </div>
      {items.map((item, i) => (
        <div key={i} className="grid grid-cols-12 gap-2 items-center">
          <Input
            className="col-span-4 h-8 text-xs"
            placeholder="Service or product"
            value={item.description}
            onChange={e => update(i, 'description', e.target.value)}
          />
          <Input
            className="col-span-2 h-8 text-xs"
            placeholder="998314"
            value={item.hsn_sac}
            onChange={e => update(i, 'hsn_sac', e.target.value)}
          />
          <Input
            className="col-span-1 h-8 text-xs text-right"
            type="number" min="1" value={item.qty}
            onChange={e => update(i, 'qty', Number(e.target.value))}
          />
          <Input
            className="col-span-2 h-8 text-xs text-right"
            type="number" min="0" step="0.01" value={item.rate}
            onChange={e => update(i, 'rate', Number(e.target.value))}
          />
          <span className="col-span-2 text-xs font-semibold text-right text-slate-700">
            {formatCurrency(item.amount, currency)}
          </span>
          <button onClick={() => remove(i)} className="col-span-1 p-1 text-slate-300 hover:text-red-400 text-center">
            ✕
          </button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="w-full h-8 text-xs mt-1 border-dashed" onClick={add}>
        <Plus className="h-3.5 w-3.5 mr-1.5" />Add line item
      </Button>
    </div>
  );
}

// ── GST Totals panel ──────────────────────────────────────────────────────────

function GstTotalsPanel({
  subtotal, taxRate, gstType, currency,
  onTaxRateChange, onGstTypeChange,
}: {
  subtotal:       number;
  taxRate:        number;
  gstType:        GstType;
  currency:       Currency;
  onTaxRateChange: (v: number) => void;
  onGstTypeChange: (v: GstType) => void;
}) {
  const gst   = computeGst(subtotal, taxRate, gstType);
  const total = subtotal + gst.total;

  return (
    <div className="rounded-lg bg-muted/40 p-4 space-y-2 text-sm">
      <div className="flex justify-between">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="font-medium">{formatCurrency(subtotal, currency)}</span>
      </div>

      {/* GST type selector */}
      <div className="flex items-center gap-2 py-1">
        <span className="text-muted-foreground text-xs">GST type</span>
        <div className="flex gap-1.5 ml-auto">
          {(['none', 'igst', 'cgst_sgst'] as GstType[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => onGstTypeChange(t)}
              className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                gstType === t
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'border-border text-muted-foreground hover:border-indigo-400'
              }`}
            >
              {t === 'none' ? 'None' : t === 'igst' ? 'IGST' : 'CGST+SGST'}
            </button>
          ))}
        </div>
      </div>

      {/* Tax rate selector (only when GST type is set) */}
      {gstType !== 'none' && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">Rate</span>
          <div className="flex gap-1 ml-auto flex-wrap justify-end">
            {GST_RATE_OPTIONS.map(r => (
              <button
                key={r}
                type="button"
                onClick={() => onTaxRateChange(r)}
                className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${
                  taxRate === r
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'border-border text-muted-foreground hover:border-indigo-400'
                }`}
              >
                {r}%
              </button>
            ))}
            {/* Custom rate input */}
            <Input
              type="number" min="0" max="100" step="0.1"
              value={taxRate}
              onChange={e => onTaxRateChange(Number(e.target.value))}
              className="h-6 w-14 text-xs text-center"
              placeholder="custom"
            />
          </div>
        </div>
      )}

      {/* GST breakdown */}
      {gstType === 'cgst_sgst' && gst.total > 0 && (
        <>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>CGST @ {taxRate / 2}%</span>
            <span>{formatCurrency(gst.cgst, currency)}</span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>SGST @ {taxRate / 2}%</span>
            <span>{formatCurrency(gst.sgst, currency)}</span>
          </div>
        </>
      )}
      {gstType === 'igst' && gst.total > 0 && (
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>IGST @ {taxRate}%</span>
          <span>{formatCurrency(gst.igst, currency)}</span>
        </div>
      )}
      {gstType === 'none' && (
        <div className="flex justify-between items-center gap-4">
          <span className="text-muted-foreground text-xs flex items-center gap-2">
            Tax
            <Input
              type="number" min="0" max="100" step="0.1"
              value={taxRate}
              onChange={e => onTaxRateChange(Number(e.target.value))}
              className="h-7 w-16 text-xs"
            />
            %
          </span>
          <span className="font-medium">{formatCurrency(gst.total, currency)}</span>
        </div>
      )}

      <div className="flex justify-between border-t border-border pt-2">
        <span className="font-bold">Total</span>
        <span className="font-bold text-lg">{formatCurrency(total, currency)}</span>
      </div>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const cfg  = STATUS_CFG[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.pill}`}>
      <Icon className="h-3 w-3" />{cfg.label}
    </span>
  );
}

// ── GSTIN field with validation hint ─────────────────────────────────────────

function GstinInput({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const valid   = value === '' || isValidGstin(value);
  const touched = value.length > 0;

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        value={value}
        onChange={e => onChange(e.target.value.toUpperCase())}
        maxLength={15}
        placeholder={placeholder ?? '22AAAAA0000A1Z5'}
        className={`h-8 text-xs font-mono ${touched && !valid ? 'border-red-400 focus-visible:ring-red-300' : ''}`}
      />
      {touched && !valid && (
        <p className="text-xs text-red-500">Invalid GSTIN format</p>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Invoices() {
  const { user, profile } = useAuth();
  const { toast }   = useToast();
  const { confirm, ConfirmDeleteDialog } = useConfirmDelete();
  const { canManage } = usePermissions('invoices');

  const [invoices,   setInvoices]   = useState<Invoice[]>([]);
  const [companies,  setCompanies]  = useState<{ id: string; name: string }[]>([]);
  const [projects,   setProjects]   = useState<{ id: string; name: string }[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing,    setEditing]    = useState<Invoice | null>(null);

  const emptyForm = {
    invoice_number: generateInvoiceNumber(),
    company_id:   '__none__',
    project_id:   '__none__',
    currency:     'INR' as Currency,
    tax_rate:     18,
    gst_type:     'cgst_sgst' as GstType,
    gstin:        '',
    buyer_gstin:  '',
    due_date:     format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    notes:        '',
    items:        [{ description: '', hsn_sac: '', qty: 1, rate: 0, amount: 0 }] as LineItem[],
  };
  const [form, setForm] = useState(emptyForm);

  // Derived totals
  const subtotal  = form.items.reduce((s, i) => s + i.amount, 0);
  const gstResult = computeGst(subtotal, form.tax_rate, form.gst_type);
  const taxAmount = gstResult.total;
  const total     = subtotal + taxAmount;

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!user) return;
    const [{ data: inv }, { data: co }, { data: pr }] = await Promise.all([
      (supabase as any).from('invoices')
        .select('*, companies:company_id(name), projects:project_id(name)')
        .order('created_at', { ascending: false }),
      (supabase as any).from('companies').select('id, name').order('name'),
      (supabase as any).from('projects').select('id, name').order('name'),
    ]);

    setInvoices(((inv ?? []) as any[]).map((i: any) => ({
      ...i,
      company_name: i.companies?.name ?? null,
      project_name: i.projects?.name  ?? null,
      currency:     (i.currency ?? 'INR') as Currency,
      gst_type:     (i.gst_type ?? 'none') as GstType,
    })));
    setCompanies(co ?? []);
    setProjects(pr ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  // Mark overdue automatically (client-side for display)
  const displayInvoices = invoices.map(inv => ({
    ...inv,
    status: (inv.status === 'sent' && inv.due_date && new Date(inv.due_date) < new Date()
      ? 'overdue' : inv.status) as InvoiceStatus,
  }));

  useEffect(() => {
    const overdue = displayInvoices.find(i => i.status === 'overdue');
    if (overdue) {
      notifyPaymentDue({
        invoiceNumber: overdue.invoice_number,
        amount:        overdue.total,
        companyName:   overdue.company_name ?? 'Unknown',
        dueDate:       overdue.due_date ?? undefined,
      });
    }
  }, [invoices]);

  const { paginatedData: paged, paginationProps } = usePagination(displayInvoices, 15);

  const resetForm = () => {
    setForm({ ...emptyForm, invoice_number: generateInvoiceNumber() });
    setEditing(null);
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.items.some(i => i.description.trim() && i.amount > 0)) {
      toast({ variant: 'destructive', title: 'Add at least one line item with a description and amount' });
      return;
    }
    if (form.gstin && !isValidGstin(form.gstin)) {
      toast({ variant: 'destructive', title: 'Invalid seller GSTIN format' });
      return;
    }
    if (form.buyer_gstin && !isValidGstin(form.buyer_gstin)) {
      toast({ variant: 'destructive', title: 'Invalid buyer GSTIN format' });
      return;
    }

    const payload = {
      invoice_number: form.invoice_number,
      company_id:     form.company_id   === '__none__' ? null : form.company_id,
      project_id:     form.project_id   === '__none__' ? null : form.project_id,
      items:          form.items,
      currency:       form.currency,
      subtotal,
      tax_rate:       form.tax_rate,
      tax_amount:     taxAmount,
      total,
      gst_type:       form.gst_type,
      gstin:          form.gstin.trim()       || null,
      buyer_gstin:    form.buyer_gstin.trim() || null,
      status:         editing?.status ?? 'draft',
      due_date:       form.due_date || null,
      notes:          form.notes.trim() || null,
    };

    if (editing) {
      const { error } = await (supabase as any).from('invoices').update(payload).eq('id', editing.id);
      if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
      toast({ title: 'Invoice updated' });
    } else {
      const { error } = await (supabase as any).from('invoices').insert({ ...payload, created_by: user?.id });
      if (error) { toast({ variant: 'destructive', title: 'Error', description: error.message }); return; }
      toast({ title: 'Invoice created' });
    }
    setDialogOpen(false); resetForm(); loadData();
  };

  // ── Status transitions ─────────────────────────────────────────────────────
  const markSent = async (inv: Invoice) => {
    await (supabase as any).from('invoices').update({ status: 'sent' }).eq('id', inv.id);
    toast({ title: 'Marked as sent' }); loadData();
  };

  const markPaid = async (inv: Invoice) => {
    await (supabase as any).from('invoices').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', inv.id);
    toast({ title: '✓ Invoice marked as paid' }); loadData();
  };

  // ── Stripe payment link ────────────────────────────────────────────────────
  const [generatingLink, setGeneratingLink] = useState<string | null>(null);
  const STRIPE_MAX = 999999.99;

  const createStripePaymentLink = async (inv: Invoice) => {
    if (inv.total > STRIPE_MAX) {
      toast({ variant: 'destructive', title: 'Invoice exceeds Stripe limit',
        description: `Stripe supports up to ${formatCurrency(STRIPE_MAX, 'USD')}. Collect manually or use Razorpay.` });
      return;
    }
    setGeneratingLink(`stripe-${inv.id}`);
    try {
      const { data, error } = await supabase.functions.invoke('create-stripe-payment-link', {
        body: {
          invoice_id:     inv.id,
          invoice_number: inv.invoice_number,
          amount_cents:   Math.round(inv.total * 100),
          company_name:   inv.company_name ?? 'Client',
          due_date:       inv.due_date ?? undefined,
        },
      });
      if (error || !data?.url) {
        toast({ variant: 'destructive', title: 'Stripe error',
          description: data?.error ?? error?.message ?? 'Could not generate payment link' });
        return;
      }
      toast({ title: 'Stripe payment link created', description: 'Link copied to clipboard' });
      await navigator.clipboard.writeText(data.url).catch(() => {});
      window.open(data.url, '_blank', 'noopener');
      loadData();
    } finally {
      setGeneratingLink(null);
    }
  };

  // ── Razorpay payment link ──────────────────────────────────────────────────
  const createRazorpayPaymentLink = async (inv: Invoice) => {
    setGeneratingLink(`razorpay-${inv.id}`);
    try {
      const { data, error } = await supabase.functions.invoke('create-razorpay-payment-link', {
        body: {
          invoice_id:     inv.id,
          invoice_number: inv.invoice_number,
          amount_paise:   Math.round(inv.total * 100),  // Razorpay uses paise
          company_name:   inv.company_name ?? 'Client',
          due_date:       inv.due_date ?? undefined,
          description:    `Payment for ${inv.invoice_number}`,
        },
      });
      if (error || !data?.url) {
        toast({ variant: 'destructive', title: 'Razorpay error',
          description: data?.error ?? error?.message ?? 'Could not generate payment link' });
        return;
      }
      toast({ title: 'Razorpay payment link created', description: 'Link copied to clipboard' });
      await navigator.clipboard.writeText(data.url).catch(() => {});
      window.open(data.url, '_blank', 'noopener');
      loadData();
    } finally {
      setGeneratingLink(null);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = (inv: Invoice) => {
    confirm({
      title:       `Delete invoice ${inv.invoice_number}?`,
      description: 'This cannot be undone.',
      onConfirm:   async () => {
        await (supabase as any).from('invoices').delete().eq('id', inv.id);
        toast({ title: 'Invoice deleted' }); loadData();
      },
    });
  };

  // ── PDF Export ─────────────────────────────────────────────────────────────
  const exportInvoicePDF = (inv: Invoice) => {
    const curr = inv.currency ?? 'INR';
    const gst  = computeGst(inv.subtotal, inv.tax_rate, inv.gst_type ?? 'none');
    const rows = [
      ...(inv.items as LineItem[]).map(item => ({
        'HSN/SAC':   item.hsn_sac ?? '—',
        Description: item.description,
        Qty:         item.qty,
        Rate:        formatCurrency(item.rate, curr),
        Amount:      formatCurrency(item.amount, curr),
      })),
      { 'HSN/SAC': '', Description: 'Subtotal', Qty: '', Rate: '', Amount: formatCurrency(inv.subtotal, curr) },
      ...(inv.gst_type === 'cgst_sgst' ? [
        { 'HSN/SAC': '', Description: `CGST @ ${inv.tax_rate / 2}%`, Qty: '', Rate: '', Amount: formatCurrency(gst.cgst, curr) },
        { 'HSN/SAC': '', Description: `SGST @ ${inv.tax_rate / 2}%`, Qty: '', Rate: '', Amount: formatCurrency(gst.sgst, curr) },
      ] : inv.gst_type === 'igst' ? [
        { 'HSN/SAC': '', Description: `IGST @ ${inv.tax_rate}%`, Qty: '', Rate: '', Amount: formatCurrency(gst.igst, curr) },
      ] : [
        { 'HSN/SAC': '', Description: `Tax (${inv.tax_rate}%)`, Qty: '', Rate: '', Amount: formatCurrency(inv.tax_amount, curr) },
      ]),
      { 'HSN/SAC': '', Description: 'TOTAL', Qty: '', Rate: '', Amount: formatCurrency(inv.total, curr) },
    ];

    const gstDetails = [
      inv.gstin      ? `Seller GSTIN: ${inv.gstin}`      : '',
      inv.buyer_gstin ? `Buyer GSTIN: ${inv.buyer_gstin}` : '',
    ].filter(Boolean).join(' | ');

    exportToPDF(`invoice_${inv.invoice_number}`, rows, {
      title:      `Invoice ${inv.invoice_number}`,
      subtitle:   [
        inv.company_name ? inv.company_name : '',
        inv.due_date ? `Due: ${format(new Date(inv.due_date), 'MMM d, yyyy')}` : '',
        gstDetails,
      ].filter(Boolean).join(' · '),
      exportedBy: profile?.email ?? 'System',
    });
  };

  // ── Stats ──────────────────────────────────────────────────────────────────
  const totalOutstanding = displayInvoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + i.total, 0);
  const totalPaid        = displayInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0);
  const overdueCount     = displayInvoices.filter(i => i.status === 'overdue').length;

  // Detect dominant currency for stats display
  const dominantCurrency: Currency = invoices.filter(i => i.currency === 'INR').length >= invoices.length / 2 ? 'INR' : 'USD';

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="text-muted-foreground mt-1">Create, send, and track client invoices with GST</p>
        </div>
        {canManage && (
          <Dialog open={dialogOpen} onOpenChange={o => { setDialogOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />New Invoice</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? `Edit ${editing.invoice_number}` : 'New Invoice'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-5">

                {/* Header fields */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Invoice number</Label>
                    <Input value={form.invoice_number}
                      onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Due date</Label>
                    <Input type="date" value={form.due_date}
                      onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Company</Label>
                    <Select value={form.company_id} onValueChange={v => setForm(f => ({ ...f, company_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Project</Label>
                    <Select value={form.project_id} onValueChange={v => setForm(f => ({ ...f, project_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Currency toggle */}
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <div className="flex gap-2">
                    {(['INR', 'USD'] as Currency[]).map(c => (
                      <button
                        key={c} type="button"
                        onClick={() => setForm(f => ({ ...f, currency: c }))}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                          form.currency === c
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'border-border text-muted-foreground hover:border-indigo-400'
                        }`}
                      >
                        {c === 'INR' ? <IndianRupee className="h-3.5 w-3.5" /> : <span className="text-xs">$</span>}
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {/* GST fields (shown when INR) */}
                {form.currency === 'INR' && (
                  <div className="grid grid-cols-2 gap-4">
                    <GstinInput
                      label="Your GSTIN (Seller)"
                      value={form.gstin}
                      onChange={v => setForm(f => ({ ...f, gstin: v }))}
                    />
                    <GstinInput
                      label="Client GSTIN (Buyer)"
                      value={form.buyer_gstin}
                      onChange={v => setForm(f => ({ ...f, buyer_gstin: v }))}
                      placeholder="Optional"
                    />
                  </div>
                )}

                {/* Line items */}
                <div className="space-y-2">
                  <Label>Line items</Label>
                  <LineItemsEditor
                    items={form.items}
                    onChange={items => setForm(f => ({ ...f, items }))}
                    currency={form.currency}
                  />
                </div>

                {/* GST Totals */}
                <GstTotalsPanel
                  subtotal={subtotal}
                  taxRate={form.tax_rate}
                  gstType={form.currency === 'INR' ? form.gst_type : 'none'}
                  currency={form.currency}
                  onTaxRateChange={v => setForm(f => ({ ...f, tax_rate: v }))}
                  onGstTypeChange={v => setForm(f => ({ ...f, gst_type: v }))}
                />

                <div className="space-y-2">
                  <Label>Notes / Payment terms</Label>
                  <Textarea value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    rows={2}
                    placeholder="e.g. Payment due within 30 days. NEFT/UPI preferred." />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                    Cancel
                  </Button>
                  <Button type="submit">{editing ? 'Update Invoice' : 'Create Invoice'}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Outstanding', value: formatCurrency(totalOutstanding, dominantCurrency), color: 'text-blue-600',    bg: 'bg-blue-50',    border: 'border-blue-100'    },
          { label: 'Collected',   value: formatCurrency(totalPaid, dominantCurrency),        color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
          { label: 'Overdue',     value: `${overdueCount} invoice${overdueCount !== 1 ? 's' : ''}`,
            color: overdueCount > 0 ? 'text-red-600' : 'text-slate-400',
            bg:    overdueCount > 0 ? 'bg-red-50'    : 'bg-slate-50',
            border: overdueCount > 0 ? 'border-red-100' : 'border-slate-100' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border ${s.border} ${s.bg} p-4`}>
            <p className={`text-xl font-black tabular-nums ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Invoice list */}
      <div className="border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-3 text-left font-medium text-muted-foreground">Invoice</th>
              <th className="p-3 text-left font-medium text-muted-foreground">Company</th>
              <th className="p-3 text-left font-medium text-muted-foreground">Project</th>
              <th className="p-3 text-right font-medium text-muted-foreground">Total</th>
              <th className="p-3 text-left font-medium text-muted-foreground">GST</th>
              <th className="p-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="p-3 text-left font-medium text-muted-foreground">Due</th>
              <th className="p-3 text-left font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-muted-foreground">
                  No invoices yet. Create your first invoice above.
                </td>
              </tr>
            )}
            {paged.map(inv => {
              const curr = inv.currency ?? 'INR';
              return (
                <tr key={inv.id} className="border-t border-border hover:bg-muted/20 transition-colors">
                  <td className="p-3">
                    <p className="font-semibold text-slate-800">{inv.invoice_number}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(inv.created_at), 'MMM d, yyyy')}</p>
                  </td>
                  <td className="p-3 text-slate-700">{inv.company_name ?? '—'}</td>
                  <td className="p-3 text-slate-600 text-xs">{inv.project_name ?? '—'}</td>
                  <td className="p-3 text-right font-bold tabular-nums">
                    {formatCurrency(inv.total, curr)}
                    {inv.gst_type !== 'none' && (
                      <p className="text-xs text-muted-foreground font-normal">
                        incl. {inv.gst_type === 'igst' ? 'IGST' : 'GST'} {inv.tax_rate}%
                      </p>
                    )}
                  </td>
                  <td className="p-3">
                    {inv.gst_type !== 'none' ? (
                      <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                        {inv.gst_type === 'igst' ? 'IGST' : 'CGST+SGST'}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3"><StatusBadge status={inv.status} /></td>
                  <td className="p-3">
                    {inv.due_date ? (
                      <span className={`text-xs ${inv.status === 'overdue' ? 'text-red-600 font-semibold' : 'text-muted-foreground'}`}>
                        {format(new Date(inv.due_date), 'MMM d, yyyy')}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">

                      {/* PDF export */}
                      <button onClick={() => exportInvoicePDF(inv)} title="Export PDF"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                        <Download className="h-3.5 w-3.5" />
                      </button>

                      {/* ── Payment link buttons (sent/overdue only) ─────────── */}
                      {canManage && (inv.status === 'sent' || inv.status === 'overdue') && (
                        <>
                          {/* Stripe — primary, always shown */}
                          {inv.stripe_payment_link ? (
                            <button
                              onClick={() => window.open(inv.stripe_payment_link!, '_blank', 'noopener')}
                              title="Open Stripe payment link"
                              className="rounded-lg p-1.5 text-violet-500 hover:bg-violet-50 hover:text-violet-700">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => createStripePaymentLink(inv)}
                              disabled={generatingLink === `stripe-${inv.id}` || inv.total > 999999.99}
                              title={inv.total > 999999.99
                                ? `Exceeds Stripe limit of ${formatCurrency(999999.99, 'USD')}`
                                : 'Generate Stripe payment link'}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-violet-50 hover:text-violet-600 disabled:opacity-30 disabled:cursor-not-allowed">
                              {generatingLink === `stripe-${inv.id}`
                                ? <Clock className="h-3.5 w-3.5 animate-spin" />
                                : <Link className="h-3.5 w-3.5" />}
                            </button>
                          )}

                          {/* Razorpay — secondary option, always shown as ₹ */}
                          {inv.razorpay_payment_link ? (
                            <button
                              onClick={() => window.open(inv.razorpay_payment_link!, '_blank', 'noopener')}
                              title="Open Razorpay payment link"
                              className="rounded-lg p-1.5 text-sky-500 hover:bg-sky-50 hover:text-sky-700">
                              <IndianRupee className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => createRazorpayPaymentLink(inv)}
                              disabled={generatingLink === `razorpay-${inv.id}`}
                              title="Generate Razorpay payment link (UPI / cards / net banking)"
                              className="rounded-lg p-1.5 text-slate-300 hover:bg-sky-50 hover:text-sky-600 disabled:opacity-30 disabled:cursor-not-allowed">
                              {generatingLink === `razorpay-${inv.id}`
                                ? <Clock className="h-3.5 w-3.5 animate-spin" />
                                : <IndianRupee className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </>
                      )}

                      {canManage && (
                        <>
                          {inv.status === 'draft' && (
                            <button onClick={() => markSent(inv)} title="Mark as sent"
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600">
                              <Send className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {(inv.status === 'sent' || inv.status === 'overdue') && (
                            <button onClick={() => markPaid(inv)} title="Mark as paid"
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button onClick={() => {
                            setEditing(inv);
                            setForm({
                              invoice_number: inv.invoice_number,
                              company_id:     inv.company_id    ?? '__none__',
                              project_id:     inv.project_id    ?? '__none__',
                              currency:       inv.currency      ?? 'INR',
                              tax_rate:       inv.tax_rate,
                              gst_type:       inv.gst_type      ?? 'none',
                              gstin:          inv.gstin         ?? '',
                              buyer_gstin:    inv.buyer_gstin   ?? '',
                              due_date:       inv.due_date ? inv.due_date.slice(0, 10) : '',
                              notes:          inv.notes         ?? '',
                              items:          (inv.items as LineItem[]).map(item => ({
                                ...item,
                                hsn_sac: item.hsn_sac ?? '',
                              })),
                            });
                            setDialogOpen(true);
                          }} title="Edit"
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleDelete(inv)} title="Delete"
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <PaginationControls {...paginationProps} />
      <ConfirmDeleteDialog />
    </div>
  );
}

/*
──────────────────────────────────────────────────────────────────────────────
DB MIGRATION — run in Supabase SQL editor
──────────────────────────────────────────────────────────────────────────────

-- Run this if the invoices table ALREADY EXISTS from a prior migration:
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS currency            TEXT NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS gst_type            TEXT NOT NULL DEFAULT 'none'
                                               CHECK (gst_type IN ('none', 'igst', 'cgst_sgst')),
  ADD COLUMN IF NOT EXISTS gstin               TEXT,          -- seller GSTIN
  ADD COLUMN IF NOT EXISTS buyer_gstin         TEXT,          -- buyer GSTIN
  ADD COLUMN IF NOT EXISTS stripe_payment_link TEXT,
  ADD COLUMN IF NOT EXISTS stripe_session_id   TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_payment_link TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id   TEXT;

-- For a fresh table:
CREATE TABLE IF NOT EXISTS invoices (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number        TEXT UNIQUE NOT NULL,
  company_id            UUID REFERENCES companies(id) ON DELETE SET NULL,
  project_id            UUID REFERENCES projects(id) ON DELETE SET NULL,
  items                 JSONB NOT NULL DEFAULT '[]',
  currency              TEXT  NOT NULL DEFAULT 'INR',
  subtotal              NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate              NUMERIC(5,2)  NOT NULL DEFAULT 0,
  tax_amount            NUMERIC(12,2) NOT NULL DEFAULT 0,
  total                 NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_type              TEXT NOT NULL DEFAULT 'none'
                        CHECK (gst_type IN ('none','igst','cgst_sgst')),
  gstin                 TEXT,
  buyer_gstin           TEXT,
  status                TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','sent','paid','overdue')),
  due_date              DATE,
  paid_at               TIMESTAMPTZ,
  notes                 TEXT,
  created_by            UUID REFERENCES profiles(id),
  created_at            TIMESTAMPTZ DEFAULT now(),
  stripe_payment_link   TEXT,
  stripe_session_id     TEXT,
  razorpay_payment_link TEXT,
  razorpay_payment_id   TEXT
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);
*/