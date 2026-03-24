import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import Razorpay from "npm:razorpay"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // CORS check
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { candidate_id } = await req.json()

    if (!candidate_id) {
      throw new Error("candidate_id is required")
    }

    const razorpay = new Razorpay({
      key_id: Deno.env.get("RAZORPAY_KEY_ID") || "",
      key_secret: Deno.env.get("RAZORPAY_KEY_SECRET") || "",
    })

    console.log(`Creating order for candidate: ${candidate_id}`)

    const order = await razorpay.orders.create({
      amount: 5000, // ₹50 (5000 paise)
      currency: "INR",
      receipt: `receipt_${candidate_id}`,
      notes: { candidate_id }
    })

    return new Response(JSON.stringify({ orderId: order.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error(`Error: ${error.message}`)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
