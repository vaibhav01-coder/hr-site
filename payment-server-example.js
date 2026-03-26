const express = require("express");
const crypto = require("crypto");
const Razorpay = require("razorpay");

const app = express();
app.use(express.json());

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

app.post("/api/payments/create-order", async (req, res) => {
    try {
        const { jobId, jobTitle, amount, currency } = req.body;

        if (!jobId || !amount || !currency) {
            return res.status(400).json({ message: "Missing payment fields." });
        }

        const order = await razorpay.orders.create({
            amount,
            currency,
            receipt: `job_${jobId}_${Date.now()}`,
            notes: {
                job_id: jobId,
                job_title: jobTitle || ""
            }
        });

        return res.json({
            orderId: order.id,
            amount: order.amount,
            currency: order.currency
        });
    } catch (error) {
        return res.status(500).json({
            message: error.error?.description || error.message || "Unable to create order."
        });
    }
});

app.post("/api/payments/verify", (req, res) => {
    const {
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature: razorpaySignature
    } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        return res.status(400).json({ message: "Missing verification fields." });
    }

    const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest("hex");

    if (expectedSignature !== razorpaySignature) {
        return res.status(400).json({ message: "Invalid payment signature." });
    }

    return res.json({ verified: true });
});

app.listen(3000, () => {
    console.log("Payment server running on http://localhost:3000");
});
