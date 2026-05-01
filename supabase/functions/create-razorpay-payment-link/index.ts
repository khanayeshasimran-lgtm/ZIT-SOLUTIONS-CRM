/**
 * supabase/functions/create-razorpay-payment-link/index.ts
 *
 * Creates a Razorpay Payment Link and stores it on the invoice row.
 *
 * Deploy:
 *   supabase functions deploy create-razorpay-payment-link --no-verify-jwt
 *
 * Environment variables (set in Supabase Dashboard → Settings → Edge Functions):
 *   RAZORPAY_KEY_ID       — rzp_live_xxx  (or rzp_test_xxx for testing)
 *   RAZORPAY_KEY_SECRET   — your key secret
 *   SUPABASE_URL          — auto-injected
 *   SUPABASE_SERVICE_ROLE_KEY — auto-injected (needed to update the invoices row)
 *
 * Alternatively the function reads credentials from the integrations table
 * (same pattern used by the Stripe function) so admins can rotate keys
 * from the UI without redeploying.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const {
      invoice_id,
      invoice_number,
      amount_paise,   // amount in paise (1 INR = 100 paise)
      company_name,
      due_date,
      description,
    } = await req.json();

    if (!invoice_id || !amount_paise || amount_paise <= 0) {
      return new Response(
        JSON.stringify({ error: 'invoice_id and amount_paise are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── 1. Get Razorpay credentials ──────────────────────────────────────────
    //    Priority: env vars → integrations table (admin UI)
    let keyId     = Deno.env.get('RAZORPAY_KEY_ID')     ?? '';
    let keySecret = Deno.env.get('RAZORPAY_KEY_SECRET')  ?? '';

    if (!keyId || !keySecret) {
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const { data: integration } = await supabaseAdmin
        .from('integrations')
        .select('credentials')
        .eq('type', 'razorpay')
        .eq('enabled', true)
        .single();

      keyId     = integration?.credentials?.key_id     ?? '';
      keySecret = integration?.credentials?.key_secret ?? '';
    }

    if (!keyId || !keySecret) {
      return new Response(
        JSON.stringify({ error: 'Razorpay not configured. Connect it in Admin → Integrations.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── 2. Create Razorpay Payment Link ──────────────────────────────────────
    const basicAuth = btoa(`${keyId}:${keySecret}`);

    // Razorpay Payment Links API
    // Docs: https://razorpay.com/docs/payments/payment-links/apis/
    const razorpayPayload: Record<string, unknown> = {
      amount:      amount_paise,           // in paise
      currency:    'INR',
      description: description ?? `Payment for ${invoice_number}`,
      reference_id: invoice_id,            // your internal ID for reconciliation
      callback_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/razorpay-webhook`,
      callback_method: 'get',
      reminder_enable: true,
      notify: {
        sms:   true,
        email: true,
      },
    };

    // Add expiry if due_date is provided
    if (due_date) {
      const expireBy = Math.floor(new Date(due_date).getTime() / 1000);
      if (expireBy > Date.now() / 1000) {
        razorpayPayload.expire_by = expireBy;
      }
    }

    // Optionally add customer info from company_name
    if (company_name) {
      razorpayPayload.customer = { name: company_name };
    }

    const rzpResponse = await fetch('https://api.razorpay.com/v1/payment_links', {
      method:  'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(razorpayPayload),
    });

    if (!rzpResponse.ok) {
      const err = await rzpResponse.json();
      console.error('Razorpay error:', err);
      return new Response(
        JSON.stringify({ error: err?.error?.description ?? 'Razorpay API error' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const rzpData = await rzpResponse.json();
    const paymentLinkUrl = rzpData.short_url;  // e.g. https://rzp.io/i/xxxxxxxxx
    const paymentLinkId  = rzpData.id;

    // ── 3. Store on invoice row ──────────────────────────────────────────────
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    await supabaseAdmin
      .from('invoices')
      .update({
        razorpay_payment_link: paymentLinkUrl,
        razorpay_payment_id:   paymentLinkId,
      })
      .eq('id', invoice_id);

    return new Response(
      JSON.stringify({ url: paymentLinkUrl, id: paymentLinkId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('Edge function error:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});