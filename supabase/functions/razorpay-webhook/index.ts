/**
 * supabase/functions/razorpay-webhook/index.ts
 *
 * Handles Razorpay payment.captured webhook events.
 * When a client completes payment, this auto-marks the invoice as paid.
 *
 * Deploy:
 *   supabase functions deploy razorpay-webhook --no-verify-jwt
 *
 * In Razorpay Dashboard → Webhooks:
 *   URL:    https://<your-project>.supabase.co/functions/v1/razorpay-webhook
 *   Events: payment_link.paid  (and optionally payment.captured)
 *   Secret: copy the generated secret → paste into Admin → Integrations → Razorpay webhook_secret
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { crypto } from 'https://deno.land/std@0.168.0/crypto/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-razorpay-signature',
};

// Razorpay HMAC-SHA256 signature verification
async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
  try {
    const enc    = new TextEncoder();
    const key    = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signed = await crypto.subtle.sign('HMAC', key, enc.encode(body));
    const hex    = Array.from(new Uint8Array(signed)).map(b => b.toString(16).padStart(2, '0')).join('');
    return hex === signature;
  } catch {
    return false;
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const rawBody   = await req.text();
  const signature = req.headers.get('x-razorpay-signature') ?? '';

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // ── Get webhook secret from integrations table ────────────────────────────
  const { data: integration } = await supabaseAdmin
    .from('integrations')
    .select('credentials')
    .eq('type', 'razorpay')
    .eq('enabled', true)
    .single();

  const webhookSecret = integration?.credentials?.webhook_secret ?? '';

  // Verify signature if secret is configured
  if (webhookSecret && signature) {
    const valid = await verifySignature(rawBody, signature, webhookSecret);
    if (!valid) {
      console.warn('Razorpay webhook: invalid signature');
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Handle payment_link.paid ──────────────────────────────────────────────
  if (event.event === 'payment_link.paid') {
    const paymentLinkId = event?.payload?.payment_link?.entity?.id;
    const referenceId   = event?.payload?.payment_link?.entity?.reference_id; // our invoice_id

    if (referenceId) {
      const { error } = await supabaseAdmin
        .from('invoices')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', referenceId);

      if (error) {
        console.error('Failed to mark invoice paid:', error);
      } else {
        console.log(`Invoice ${referenceId} marked as paid via Razorpay link ${paymentLinkId}`);
      }
    }
  }

  // ── Handle payment.captured (fallback) ────────────────────────────────────
  if (event.event === 'payment.captured') {
    const paymentId   = event?.payload?.payment?.entity?.id;
    const referenceId = event?.payload?.payment?.entity?.description; // may contain invoice ref

    // Best-effort: find invoice by razorpay_payment_id if stored
    if (paymentId) {
      await supabaseAdmin
        .from('invoices')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('razorpay_payment_id', paymentId)
        .eq('status', 'sent');  // only update if currently sent
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});