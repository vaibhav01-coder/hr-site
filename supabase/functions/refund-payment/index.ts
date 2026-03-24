import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import Razorpay from "npm:razorpay"
import { createClient } from "npm:@supabase/supabase-js"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { application_id, payment_id } = await req.json()

    if (!payment_id || !application_id) {
        throw new Error("application_id and payment_id are required")
    }

    // Init Razorpay Server Client
    const razorpay = new Razorpay({
      key_id: Deno.env.get("RAZORPAY_KEY_ID") || "",
      key_secret: Deno.env.get("RAZORPAY_KEY_SECRET") || "",
    })

    console.log(`Creating ₹50 refund for payment ${payment_id}`)

    const refund = await razorpay.payments.refund(payment_id, {
      amount: 5000, // ₹50 fully refunded
    })

    // Update application in Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ""
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ""
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { error } = await supabase
      .from('applications')
      .update({ 
        status: 'rejected',
        refund_status: 'refunded',
        refund_id: refund.id 
      })
      .eq('id', application_id)

    if (error) throw error

    return new Response(JSON.stringify({ success: true, refund_id: refund.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error(`Refund error: ${error.message}`)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
