/**
 * services/notifications.service.ts
 *
 * Client-side notification dispatcher.
 * Call these functions from CRM pages when key events happen.
 * Each function:
 *   1. Shows an in-app toast (always)
 *   2. Calls the send-email Edge Function (if user opted in)
 *
 * ── Usage examples ─────────────────────────────────────────────────────────────
 *
 * // In Pipeline.tsx when a deal moves to 'won':
 * import { notifyDealWon } from '@/services/notifications.service';
 * await notifyDealWon({ dealTitle: 'Acme Corp', value: 50000 });
 *
 * // In Activities.tsx when checking for overdue:
 * import { notifyOverdueTask } from '@/services/notifications.service';
 * await notifyOverdueTask({ taskTitle: 'Follow up call', dueDate: '2026-04-20' });
 *
 * // In Invoices.tsx when invoice becomes due:
 * import { notifyPaymentDue } from '@/services/notifications.service';
 * await notifyPaymentDue({ invoiceNumber: 'INV-001', amount: 5000, companyName: 'Acme' });
 *
 * // In Dashboard.tsx for idle lead alert:
 * import { notifyIdleLead } from '@/services/notifications.service';
 * await notifyIdleLead({ leadName: 'John Doe', daysSinceContact: 5 });
 *
 * // In Tickets.tsx when new ticket is created:
 * import { notifyNewTicket } from '@/services/notifications.service';
 * await notifyNewTicket({ ticketTitle: 'Login issue', priority: 'high' });
 */

import { supabase } from '@/integrations/supabase/client';

// ── Types ──────────────────────────────────────────────────────────────────────

type NotifEvent = 'deal_won' | 'overdue_task' | 'payment_due' | 'idle_lead' | 'new_ticket';

interface SendEmailPayload {
  event:    NotifEvent;
  subject:  string;
  body:     string;
  to?:      string[];
  meta?:    Record<string, string>;
}

// ── Core dispatcher ────────────────────────────────────────────────────────────

/**
 * Invokes the send-email Edge Function.
 * Fails silently — never throws, never blocks CRM actions.
 */
async function dispatch(payload: SendEmailPayload): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('send-email', { body: payload });
    if (error) {
      console.warn('[notifications] Edge function error:', error.message);
    }
  } catch (err) {
    console.warn('[notifications] Failed to dispatch notification:', err);
  }
}

// ── Event helpers ──────────────────────────────────────────────────────────────

/**
 * Notify: Deal Won
 * Call this immediately after a deal's stage is set to 'won'.
 */
export async function notifyDealWon(params: {
  dealTitle: string;
  value:     number;
  wonBy?:    string;
}): Promise<void> {
  const fmt = (v: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(v);

  await dispatch({
    event:   'deal_won',
    subject: `🎉 Deal Won: ${params.dealTitle}`,
    body: [
      `Great news — a deal has been closed!`,
      ``,
      `Deal:   ${params.dealTitle}`,
      `Value:  ${fmt(params.value)}`,
      params.wonBy ? `Won by: ${params.wonBy}` : '',
      ``,
      `Log in to Z IT Solutions CRM to view the full pipeline.`,
    ].filter(Boolean).join('\n'),
    meta: {
      'Deal':  params.dealTitle,
      'Value': fmt(params.value),
      ...(params.wonBy ? { 'Won by': params.wonBy } : {}),
    },
  });
}

/**
 * Notify: Overdue Task
 * Call this when an activity's due_date has passed and status is still 'scheduled'.
 */
export async function notifyOverdueTask(params: {
  taskTitle: string;
  dueDate:   string;
  assignee?: string;
}): Promise<void> {
  await dispatch({
    event:   'overdue_task',
    subject: `⚠️ Overdue Task: ${params.taskTitle}`,
    body: [
      `A task is past its due date and needs attention.`,
      ``,
      `Task:     ${params.taskTitle}`,
      `Due date: ${params.dueDate}`,
      params.assignee ? `Assigned: ${params.assignee}` : '',
      ``,
      `Please update or complete this task in Z IT Solutions CRM.`,
    ].filter(Boolean).join('\n'),
    meta: {
      'Task':     params.taskTitle,
      'Due date': params.dueDate,
      ...(params.assignee ? { 'Assigned to': params.assignee } : {}),
    },
  });
}

/**
 * Notify: Invoice Payment Due
 * Call this when an invoice's due_date is today or has passed.
 */
export async function notifyPaymentDue(params: {
  invoiceNumber: string;
  amount:        number;
  companyName:   string;
  dueDate?:      string;
}): Promise<void> {
  const fmt = (v: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(v);

  await dispatch({
    event:   'payment_due',
    subject: `💳 Payment Due: ${params.invoiceNumber} — ${params.companyName}`,
    body: [
      `An invoice payment is due and requires action.`,
      ``,
      `Invoice:  ${params.invoiceNumber}`,
      `Client:   ${params.companyName}`,
      `Amount:   ${fmt(params.amount)}`,
      params.dueDate ? `Due date: ${params.dueDate}` : '',
      ``,
      `View and manage this invoice in Z IT Solutions CRM.`,
    ].filter(Boolean).join('\n'),
    meta: {
      'Invoice': params.invoiceNumber,
      'Client':  params.companyName,
      'Amount':  fmt(params.amount),
      ...(params.dueDate ? { 'Due date': params.dueDate } : {}),
    },
  });
}

/**
 * Notify: Idle Lead
 * Call this from the Dashboard idle lead alert or a background check.
 */
export async function notifyIdleLead(params: {
  leadName:         string;
  daysSinceContact: number;
  assignedTo?:      string;
}): Promise<void> {
  await dispatch({
    event:   'idle_lead',
    subject: `⏰ Idle Lead: ${params.leadName} (${params.daysSinceContact} days)`,
    body: [
      `A lead has gone ${params.daysSinceContact} days without contact.`,
      ``,
      `Lead:              ${params.leadName}`,
      `Days since contact: ${params.daysSinceContact}`,
      params.assignedTo ? `Assigned to:       ${params.assignedTo}` : '',
      ``,
      `Follow up now to keep this lead warm.`,
    ].filter(Boolean).join('\n'),
    meta: {
      'Lead':               params.leadName,
      'Days without contact': String(params.daysSinceContact),
      ...(params.assignedTo ? { 'Assigned to': params.assignedTo } : {}),
    },
  });
}

/**
 * Notify: New Support Ticket
 * Call this when a new ticket is inserted into the tickets table.
 */
export async function notifyNewTicket(params: {
  ticketTitle: string;
  priority:    string;
  createdBy?:  string;
  company?:    string;
}): Promise<void> {
  const priorityEmoji: Record<string, string> = {
    urgent: '🔴', high: '🟠', medium: '🟡', low: '🟢',
  };
  const emoji = priorityEmoji[params.priority] ?? '📋';

  await dispatch({
    event:   'new_ticket',
    subject: `${emoji} New Ticket: ${params.ticketTitle}`,
    body: [
      `A new support ticket has been submitted.`,
      ``,
      `Title:    ${params.ticketTitle}`,
      `Priority: ${params.priority.charAt(0).toUpperCase() + params.priority.slice(1)}`,
      params.company   ? `Company:  ${params.company}`   : '',
      params.createdBy ? `From:     ${params.createdBy}` : '',
      ``,
      `Assign and respond in Z IT Solutions CRM.`,
    ].filter(Boolean).join('\n'),
    meta: {
      'Title':    params.ticketTitle,
      'Priority': params.priority,
      ...(params.company   ? { 'Company': params.company }   : {}),
      ...(params.createdBy ? { 'From':    params.createdBy } : {}),
    },
  });
}

/**
 * Generic notification dispatcher — use when you need a custom event.
 */
export async function notifyCustom(params: {
  event:   NotifEvent;
  subject: string;
  body:    string;
  to?:     string[];
  meta?:   Record<string, string>;
}): Promise<void> {
  await dispatch(params);
}