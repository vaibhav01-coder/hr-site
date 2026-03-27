const express = require("express");
const nodemailer = require("nodemailer");

const app = express();
app.use(express.json());

const DEFAULT_HR_EMAIL = "arvinddamor1444@gmail.com";

const mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    auth: process.env.SMTP_USER && process.env.SMTP_PASS ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    } : undefined
});

app.post("/api/applications/notify-hr", async (req, res) => {
    try {
        const { applicationId, submittedAt, jobTitle, company, applicant, resume } = req.body;

        if (!applicationId || !jobTitle || !applicant?.fullName || !applicant?.email || !applicant?.phone || !resume?.signedUrl) {
            return res.status(400).json({ message: "Missing application email fields." });
        }

        if (!process.env.SMTP_HOST) {
            return res.status(500).json({ message: "Email server configuration is incomplete." });
        }

        const submittedDate = submittedAt
            ? new Date(submittedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
            : new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

        const lines = [
            "New application received from the HR hiring portal.",
            "",
            `Application ID: ${applicationId}`,
            `Submitted At: ${submittedDate}`,
            `Job Title: ${jobTitle}`,
            `Company: ${company || "Not provided"}`,
            "",
            `Name: ${applicant.fullName}`,
            `Email: ${applicant.email}`,
            `Phone: ${applicant.phone}`,
            `DOB: ${applicant.dob || "Not provided"}`,
            `Gender: ${applicant.gender || "Not provided"}`,
            `Address: ${applicant.address || "Not provided"}`,
            `Qualification: ${applicant.qualification || "Not provided"}`,
            `Experience: ${applicant.experience || "Not provided"}`,
            `Current Title: ${applicant.currentTitle || "Not provided"}`,
            `LinkedIn: ${applicant.linkedin || "Not provided"}`,
            `Skills: ${applicant.skills || "Not provided"}`,
            `Cover Letter: ${applicant.coverLetter || "Not provided"}`,
            "",
            `Resume File: ${resume.fileName || "resume"}`,
            `Resume Link: ${resume.signedUrl}`
        ];

        await mailer.sendMail({
            from: process.env.HR_EMAIL_FROM || process.env.SMTP_USER || DEFAULT_HR_EMAIL,
            to: process.env.HR_EMAIL_TO || DEFAULT_HR_EMAIL,
            subject: `New application for ${jobTitle}`,
            text: lines.join("\n"),
            attachments: [
                {
                    filename: resume.fileName || "resume",
                    path: resume.signedUrl
                }
            ]
        });

        return res.json({ sent: true });
    } catch (error) {
        return res.status(500).json({
            message: error.message || "Unable to send HR email."
        });
    }
});

app.listen(3000, () => {
    console.log("Application server running on http://localhost:3000");
});
