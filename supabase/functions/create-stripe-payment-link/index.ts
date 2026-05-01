/**
 * supabase/functions/create-stripe-payment-link/index.ts
 *
 * Creates a Stripe Checkout Session (payment link) for a given invoice.
 *
 * Request body:
 *   { invoice_id, invoice_number, amount_cents, company_name, due_date? }
 *
 * Response:
 *   { url: string }   — the Stripe Checkout URL to open / copy
 *   { error: string } — if anything fails
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Parse request ────────────────────────────────────────────────────────
    const { invoice_id, invoice_number, amount_cents, company_name } =
      await req.json() as {
        invoice_id:     string;
        invoice_number: string;
        amount_cents:   number;
        company_name:   string;
        due_date?:      string;
      };

    if (!invoice_id || !invoice_number || !amount_cents) {
      return new Response(
        JSON.stringify({ error: 'invoice_id, invoice_number, and amount_cents are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Read Stripe secret key from integrations table ───────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: integration, error: intErr } = await supabase
      .from('integrations')
      .select('credentials')
      .eq('type', 'stripe')
      .maybeSingle();

    if (intErr || !integration?.credentials?.secret_key) {
      return new Response(
        JSON.stringify({ error: 'Stripe is not configured. Add your secret key in Admin → Integrations.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const stripeKey: string = integration.credentials.secret_key;

    // ── Build Checkout Session via Stripe REST API ───────────────────────────
    // NOTE: expires_at must be 30 min – 24 hours from now (Stripe hard limit).
    // We use 23 hours so there's always a safe buffer.
    const expiresAt = Math.floor((Date.now() + 23 * 60 * 60 * 1000) / 1000);

    const body = new URLSearchParams();
    body.append('payment_method_types[]', 'card');
    body.append('line_items[0][price_data][currency]', 'usd');
    body.append('line_items[0][price_data][product_data][name]', `Invoice ${invoice_number}`);
    body.append('line_items[0][price_data][product_data][description]', company_name ?? '');
    body.append('line_items[0][price_data][unit_amount]', String(amount_cents));
    body.append('line_items[0][quantity]', '1');
    body.append('mode', 'payment');
    body.append('metadata[invoice_id]', invoice_id);
    body.append('metadata[invoice_number]', invoice_number);
    body.append('expires_at', String(expiresAt));
    body.append('success_url', `${Deno.env.get('SITE_URL') ?? 'https://your-app.com'}/invoices?paid=${invoice_id}`);
    body.append('cancel_url', `${Deno.env.get('SITE_URL') ?? 'https://your-app.com'}/invoices`);

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const session = await stripeRes.json() as { id?: string; url?: string; error?: { message: string } };

    if (!stripeRes.ok || !session.url) {
      console.error('[create-stripe-payment-link] Stripe error:', JSON.stringify(session.error));
      return new Response(
        JSON.stringify({ error: session.error?.message ?? 'Stripe API error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Persist the payment link on the invoice row ──────────────────────────
    const { error: updateErr } = await supabase
      .from('invoices')
      .update({
        stripe_payment_link: session.url,
        stripe_session_id:   session.id,
      })
      .eq('id', invoice_id);

    if (updateErr) {
      console.error('[create-stripe-payment-link] DB update error:', updateErr.message);
      // Still return the URL — the link works even if we couldn't save it
    }

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    console.error('[create-stripe-payment-link] Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});