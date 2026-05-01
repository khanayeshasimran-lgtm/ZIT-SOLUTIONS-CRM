/**
 * supabase/functions/stripe-webhook/index.ts
 *
 * Receives Stripe webhook events and updates invoices automatically.
 *
 * Events handled:
 *   checkout.session.completed  → mark invoice as paid
 *   payment_intent.succeeded    → mark invoice as paid (fallback)
 *   checkout.session.expired    → clear the payment link so a new one can be generated
 *
 * Setup (Stripe Dashboard → Developers → Webhooks):
 *   1. Endpoint URL: https://<project>.supabase.co/functions/v1/stripe-webhook
 *   2. Events to listen for: checkout.session.completed, checkout.session.expired,
 *      payment_intent.succeeded
 *   3. Copy the Signing Secret → paste into Admin → Integrations → Stripe → Webhook Secret
 *
 * Signature verification:
 *   Stripe signs every webhook with a HMAC-SHA256 signature in the
 *   Stripe-Signature header. We verify it using the webhook_secret stored in
 *   the integrations table. Without this, anyone could POST fake events.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { crypto } from 'https://deno.land/std@0.168.0/crypto/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};

// ── HMAC-SHA256 signature verification ───────────────────────────────────────
// Stripe signature format: t=<timestamp>,v1=<sig1>[,v1=<sig2>...]
// Signed payload: `${timestamp}.${rawBody}`

async function verifyStripeSignature(
  rawBody:   string,
  header:    string,
  secret:    string,
  tolerance: number = 300, // 5 minutes
): Promise<boolean> {
  try {
    const parts     = Object.fromEntries(header.split(',').map(p => p.split('=')));
    const timestamp = parseInt(parts['t'], 10);
    const signatures = header.split(',').filter(p => p.startsWith('v1=')).map(p => p.slice(3));

    if (Math.abs(Date.now() / 1000 - timestamp) > tolerance) return false;

    const payload  = `${timestamp}.${rawBody}`;
    const keyData  = new TextEncoder().encode(secret);
    const msgData  = new TextEncoder().encode(payload);

    const key = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const sig  = await crypto.subtle.sign('HMAC', key, msgData);
    const hex  = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2,'0')).join('');

    return signatures.includes(hex);
  } catch {
    return false;
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const rawBody = await req.text();
  const sigHeader = req.headers.get('stripe-signature') ?? '';

  // ── Read webhook secret from integrations table ───────────────────────────
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: integration } = await supabase
    .from('integrations')
    .select('config')
    .eq('type', 'stripe')
    .maybeSingle();

  const webhookSecret: string | undefined = integration?.config?.webhook_secret;

  // ── Verify signature (skip only if no secret configured — dev mode) ────────
  if (webhookSecret) {
    const valid = await verifyStripeSignature(rawBody, sigHeader, webhookSecret);
    if (!valid) {
      console.warn('[stripe-webhook] Invalid signature — request rejected');
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } else {
    console.warn('[stripe-webhook] No webhook_secret configured — skipping signature check (dev mode)');
  }

  // ── Parse event ───────────────────────────────────────────────────────────
  let event: { type: string; data: { object: Record<string, any> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log('[stripe-webhook] Received event:', event.type);

  // ── Handle events ─────────────────────────────────────────────────────────
  try {
    switch (event.type) {

      // ── Payment completed ────────────────────────────────────────────────
      case 'checkout.session.completed':
      case 'payment_intent.succeeded': {
        const obj = event.data.object;

        // Extract invoice_id from metadata
        const invoiceId: string | undefined =
          obj.metadata?.invoice_id ??              // checkout.session
          obj.metadata?.invoice_id;                // payment_intent (if set)

        if (!invoiceId) {
          console.log('[stripe-webhook] No invoice_id in metadata — skipping');
          break;
        }

        const { error } = await supabase
          .from('invoices')
          .update({
            status:  'paid',
            paid_at: new Date().toISOString(),
          })
          .eq('id', invoiceId)
          .in('status', ['sent', 'overdue']); // Only update if not already paid/draft

        if (error) {
          console.error('[stripe-webhook] Failed to mark invoice paid:', error.message);
        } else {
          console.log('[stripe-webhook] Invoice marked as paid:', invoiceId);
        }
        break;
      }

      // ── Session expired — clear the link so user can regenerate ──────────
      case 'checkout.session.expired': {
        const obj = event.data.object;
        const invoiceId: string | undefined = obj.metadata?.invoice_id;

        if (invoiceId) {
          await supabase
            .from('invoices')
            .update({ stripe_payment_link: null, stripe_session_id: null })
            .eq('id', invoiceId);
          console.log('[stripe-webhook] Cleared expired payment link for invoice:', invoiceId);
        }
        break;
      }

      default:
        console.log('[stripe-webhook] Unhandled event type:', event.type);
    }
  } catch (err) {
    console.error('[stripe-webhook] Handler error:', err);
    return new Response(JSON.stringify({ error: 'Handler error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});