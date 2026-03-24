import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js"
import crypto from "node:crypto"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, application_id } = await req.json()
    
    // Validate signature via HMAC SHA256 using the node:crypto module
    const secret = Deno.env.get("RAZORPAY_KEY_SECRET") || ""
    const generated_signature = crypto
      .createHmac('sha256', secret)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest('hex');

    if (generated_signature !== razorpay_signature) {
      throw new Error("Invalid payment signature")
    }

    // Updating application record using Service Role Key
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ""
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ""
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log(`Verifying payment for application: ${application_id}`)

    const { error } = await supabase
      .from('applications')
      .update({ 
        payment_id: razorpay_payment_id, 
        payment_status: 'paid' 
      })
      .eq('id', application_id)
      
    if (error) throw error

    return new Response(JSON.stringify({ success: true, payment_id: razorpay_payment_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error(`Error verifying payment: ${error.message}`)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
