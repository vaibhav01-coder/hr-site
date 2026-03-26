const jobs = [
    {
        id: "job-1",
        title: "Production Operator",
        company: "Raicam Industries",
        department: "Production",
        location: "Sanand, Gujarat",
        job_type: "full_time",
        salary_range: "Rs. 16,000 - Rs. 22,000",
        skills_required: ["Machine Operation", "Quality Check", "Assembly"],
        description: "Operate production lines, maintain daily output targets, and follow safety procedures.",
        perks: "Bus, canteen, attendance incentives",
        applicants: 42
    },
    {
        id: "job-2",
        title: "Quality Inspector",
        company: "Raicam Industries",
        department: "Quality",
        location: "Ahmedabad, Gujarat",
        job_type: "full_time",
        salary_range: "Rs. 18,000 - Rs. 24,000",
        skills_required: ["Inspection", "Documentation", "Measurement Tools"],
        description: "Inspect materials and finished goods, prepare shift reports, and coordinate with production teams.",
        perks: "Canteen, transport, uniform",
        applicants: 18
    },
    {
        id: "job-3",
        title: "Warehouse Assistant",
        company: "Prime Logistics",
        department: "Operations",
        location: "Sanand, Gujarat",
        job_type: "contract",
        salary_range: "Rs. 14,000 - Rs. 18,000",
        skills_required: ["Inventory", "Packing", "Dispatch"],
        description: "Handle inventory, packing, dispatch coordination, and warehouse checks.",
        perks: "Night allowance, shift meal",
        applicants: 26
    },
    {
        id: "job-4",
        title: "HR Executive",
        company: "Talent Edge",
        department: "Human Resources",
        location: "Remote / Ahmedabad",
        job_type: "part_time",
        salary_range: "Rs. 20,000 - Rs. 28,000",
        skills_required: ["Recruitment", "Screening", "Communication"],
        description: "Assist in candidate sourcing, interview scheduling, onboarding, and reporting.",
        perks: "Hybrid work, flexible hours",
        applicants: 11
    }
];

const applications = [
    { id: "app-1", candidate: "Ravi Kumar", jobId: "job-1", experience: "2 years", paymentStatus: "paid", status: "under_review", steps: [true, true, false, false, false] },
    { id: "app-2", candidate: "Sneha Patel", jobId: "job-2", experience: "3 years", paymentStatus: "paid", status: "shortlisted", steps: [true, true, true, false, false] },
    { id: "app-3", candidate: "Aman Singh", jobId: "job-3", experience: "1 year", paymentStatus: "refund_initiated", status: "rejected", steps: [true, true, true, true, false] }
];

const qs = (selector) => document.querySelector(selector);
const qsa = (selector) => [...document.querySelectorAll(selector)];
const params = () => new URLSearchParams(window.location.search);
const getJob = (jobId) => jobs.find((job) => job.id === jobId) || jobs[0];
let supabaseClient = null;

function getPaymentConfig() {
    return window.HR_PAYMENT_CONFIG || null;
}

async function postJson(url, body) {
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    let payload = {};
    try {
        payload = await response.json();
    } catch (error) {
        payload = {};
    }

    if (!response.ok) {
        throw new Error(payload.message || "Request failed.");
    }

    return payload;
}

function getSupabaseClient() {
    if (supabaseClient) return supabaseClient;
    const config = window.HR_SUPABASE_CONFIG;
    if (!window.supabase || !config || !config.url || !config.anonKey) return null;
    supabaseClient = window.supabase.createClient(config.url, config.anonKey);
    return supabaseClient;
}

function toast(message) {
    const root = qs("#toast-root");
    if (!root) return;
    const item = document.createElement("div");
    item.className = "toast";
    item.textContent = message;
    root.appendChild(item);
    window.setTimeout(() => item.remove(), 2800);
}

function initCookieBanner() {
    const banner = qs("#cookie-banner");
    if (!banner) return;
    if (!localStorage.getItem("hr_cookie_accept")) banner.classList.add("show");
    qs("#accept-cookies")?.addEventListener("click", () => {
        localStorage.setItem("hr_cookie_accept", "1");
        banner.classList.remove("show");
    });
}

function initMenu() {
    const toggle = qs("#menu-toggle");
    const nav = qs("#site-nav");
    if (!toggle || !nav) return;
    toggle.addEventListener("click", () => nav.classList.toggle("open"));
}

function featuredCard(job) {
    return `
        <article class="card">
            <div class="card-head">
                <div><h3>${job.title}</h3><p>${job.company}</p></div>
                <span class="status-pill">${job.job_type.replace("_", " ")}</span>
            </div>
            <div class="summary-list">
                <div class="summary-item"><span>Location</span><strong>${job.location}</strong></div>
                <div class="summary-item"><span>Salary</span><strong>${job.salary_range}</strong></div>
            </div>
            <a class="btn btn-primary full-width" href="job-detail.html?id=${job.id}">View Detail</a>
        </article>
    `;
}

function renderFeaturedJobs() {
    const container = qs("#featured-jobs");
    if (container) container.innerHTML = jobs.slice(0, 3).map(featuredCard).join("");
}

function jobListCard(job) {
    return `
        <article class="job-list-card">
            <div class="job-list-head">
                <div><h3>${job.title}</h3><p>${job.company} · ${job.department}</p></div>
                <span class="status-pill">${job.applicants} applicants</span>
            </div>
            <div class="summary-list">
                <div class="summary-item"><span>Location</span><strong>${job.location}</strong></div>
                <div class="summary-item"><span>Type</span><strong>${job.job_type.replace("_", " ")}</strong></div>
                <div class="summary-item"><span>Salary</span><strong>${job.salary_range}</strong></div>
                <div class="summary-item"><span>Skills</span><strong>${job.skills_required.join(", ")}</strong></div>
            </div>
            <div class="hero-actions">
                <a class="btn btn-outline" href="job-detail.html?id=${job.id}">View Detail</a>
                <a class="btn btn-primary" href="apply.html?id=${job.id}">Apply Now - Rs. 50 Refundable Fee</a>
            </div>
        </article>
    `;
}

function renderJobsPage() {
    const container = qs("#jobs-list");
    if (!container) return;
    const search = qs("#job-search");
    const chips = qsa(".chip");
    let activeFilter = "all";

    function draw() {
        const query = (search?.value || "").toLowerCase();
        const filtered = jobs.filter((job) => {
            const matchesFilter = activeFilter === "all" || job.job_type === activeFilter;
            const text = `${job.title} ${job.location} ${job.company} ${job.skills_required.join(" ")}`.toLowerCase();
            return matchesFilter && text.includes(query);
        });
        container.innerHTML = filtered.map(jobListCard).join("");
    }

    chips.forEach((chip) => {
        chip.addEventListener("click", () => {
            chips.forEach((item) => item.classList.remove("active"));
            chip.classList.add("active");
            activeFilter = chip.dataset.filter;
            draw();
        });
    });
    search?.addEventListener("input", draw);
    draw();
}

function renderJobDetail() {
    const main = qs("#job-detail-main");
    const side = qs("#job-detail-side");
    if (!main || !side) return;
    const job = getJob(params().get("id"));

    main.innerHTML = `
        <span class="eyebrow">Job Detail</span>
        <h1>${job.title}</h1>
        <p>${job.company} · ${job.department} · ${job.location}</p>
        <div class="summary-list" style="margin-top:20px;">
            <div class="summary-item"><span>Description</span><strong>${job.description}</strong></div>
            <div class="summary-item"><span>Required Skills</span><strong>${job.skills_required.join(", ")}</strong></div>
            <div class="summary-item"><span>Perks</span><strong>${job.perks}</strong></div>
            <div class="summary-item"><span>Salary Range</span><strong>${job.salary_range}</strong></div>
        </div>
    `;
    side.innerHTML = `
        <span class="eyebrow">Quick Summary</span>
        <div class="summary-list">
            <div class="summary-item"><span>Job Type</span><strong>${job.job_type.replace("_", " ")}</strong></div>
            <div class="summary-item"><span>Applicants</span><strong>${job.applicants}</strong></div>
            <div class="summary-item"><span>Posted By</span><strong>HR Admin</strong></div>
        </div>
        <div class="hero-actions" style="margin-top:18px;">
            <a class="btn btn-primary full-width" href="apply.html?id=${job.id}">Apply Now</a>
            <a class="btn btn-outline full-width" href="jobs.html">Back to Jobs</a>
        </div>
    `;
}

function setupApplyPage() {
    const subtitle = qs("#apply-job-subtitle");
    if (!subtitle) return;
    const job = getJob(params().get("id"));
    const summary = qs("#apply-job-summary");
    const paymentLink = qs("#go-payment-link");
    const paymentLock = qs("#payment-lock");
    const preview = qs("#preview-card");
    const next = qs("#next-step");
    const prev = qs("#prev-step");
    const submit = qs("#submit-application");
    const form = qs("#apply-form");
    const steps = qsa(".form-step");
    const tabs = qsa(".stepper .step");
    let current = 0;

    subtitle.textContent = `${job.title} · ${job.company}`;
    summary.innerHTML = `
        <div class="summary-item"><span>Role</span><strong>${job.title}</strong></div>
        <div class="summary-item"><span>Company</span><strong>${job.company}</strong></div>
        <div class="summary-item"><span>Location</span><strong>${job.location}</strong></div>
        <div class="summary-item"><span>Fee</span><strong>Rs. 50 refundable</strong></div>
    `;
    paymentLink.href = `payment.html?id=${job.id}`;

    function paymentDone() {
        return localStorage.getItem(`payment:${job.id}`) === "paid";
    }

    function renderStep() {
        steps.forEach((step, index) => step.classList.toggle("active", index === current));
        tabs.forEach((tab, index) => tab.classList.toggle("active", index === current));
        prev.style.visibility = current === 0 ? "hidden" : "visible";
        next.hidden = current === steps.length - 1;
        submit.hidden = current !== steps.length - 1;
        submit.disabled = !paymentDone();
        paymentLock.textContent = paymentDone() ? "Payment verified" : "Pending payment";
        paymentLock.classList.toggle("success", paymentDone());

        if (current === steps.length - 1) {
            preview.innerHTML = `
                <span class="eyebrow">Preview</span>
                <div class="summary-list">
                    <div class="summary-item"><span>Name</span><strong>${qs("#full_name")?.value || "Not provided"}</strong></div>
                    <div class="summary-item"><span>Email</span><strong>${qs("#email")?.value || "Not provided"}</strong></div>
                    <div class="summary-item"><span>Phone</span><strong>${qs("#phone")?.value || "Not provided"}</strong></div>
                    <div class="summary-item"><span>Qualification</span><strong>${qs("#qualification")?.value || "Not provided"}</strong></div>
                    <div class="summary-item"><span>Experience</span><strong>${qs("#experience")?.value || "Not provided"}</strong></div>
                    <div class="summary-item"><span>Skills</span><strong>${qs("#skills")?.value || "Not provided"}</strong></div>
                </div>
            `;
        }
    }

    next.addEventListener("click", () => { if (current < steps.length - 1) { current += 1; renderStep(); } });
    prev.addEventListener("click", () => { if (current > 0) { current -= 1; renderStep(); } });
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!paymentDone()) return toast("Complete the payment step first.");
        localStorage.setItem("latestApplication", JSON.stringify({ jobId: job.id, title: job.title }));
        toast("Application submitted successfully.");
    });
    renderStep();
}

function setupPaymentPage() {
    const summary = qs("#payment-job-summary");
    if (!summary) return;
    const job = getJob(params().get("id"));
    const confirmBtn = qs("#confirm-payment-btn");
    const backLink = qs("#back-to-apply-link");
    const statusBox = qs("#payment-status-box");
    const paymentConfig = getPaymentConfig();

    summary.innerHTML = `
        <div class="summary-item"><span>Job</span><strong>${job.title}</strong></div>
        <div class="summary-item"><span>Company</span><strong>${job.company}</strong></div>
        <div class="summary-item"><span>Amount</span><strong>Rs. 50</strong></div>
        <div class="summary-item"><span>Status</span><strong>${localStorage.getItem(`payment:${job.id}`) === "paid" ? "Payment verified" : "Awaiting checkout"}</strong></div>
    `;
    backLink.href = `apply.html?id=${job.id}`;

    function setPaymentStatus(message) {
        if (statusBox) statusBox.innerHTML = `<strong>Status:</strong> ${message}`;
    }

    if (!paymentConfig || !paymentConfig.razorpayKeyId || paymentConfig.razorpayKeyId === "rzp_test_your_key_id") {
        setPaymentStatus("Add your Razorpay key and backend endpoints in payment-config.js before going live.");
    }

    confirmBtn.addEventListener("click", async () => {
        if (!window.Razorpay) {
            setPaymentStatus("Razorpay checkout failed to load. Check your internet connection and try again.");
            return toast("Unable to load Razorpay.");
        }

        if (!paymentConfig || !paymentConfig.orderEndpoint || !paymentConfig.verifyEndpoint || !paymentConfig.razorpayKeyId) {
            setPaymentStatus("Payment configuration is incomplete.");
            return toast("Payment configuration missing.");
        }

        confirmBtn.disabled = true;
        setPaymentStatus("Creating secure payment order...");

        const applicant = {
            full_name: qs("#full_name")?.value || "",
            email: qs("#email")?.value || "",
            phone: qs("#phone")?.value || "",
            qualification: qs("#qualification")?.value || ""
        };

        try {
            const order = await postJson(paymentConfig.orderEndpoint, {
                jobId: job.id,
                jobTitle: job.title,
                amount: paymentConfig.amount,
                currency: paymentConfig.currency,
                applicant
            });

            const razorpay = new window.Razorpay({
                key: paymentConfig.razorpayKeyId,
                amount: order.amount || paymentConfig.amount,
                currency: order.currency || paymentConfig.currency,
                name: paymentConfig.companyName || "HR Hiring Portal",
                description: `Application fee for ${job.title}`,
                image: paymentConfig.companyLogo || undefined,
                order_id: order.orderId,
                handler: async function (response) {
                    setPaymentStatus("Verifying payment...");

                    try {
                        await postJson(paymentConfig.verifyEndpoint, {
                            jobId: job.id,
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature
                        });

                        localStorage.setItem(`payment:${job.id}`, "paid");
                        localStorage.setItem(`payment_details:${job.id}`, JSON.stringify(response));
                        setPaymentStatus("Payment verified successfully. Redirecting to your application...");
                        toast("Payment verified.");
                        window.setTimeout(() => {
                            window.location.href = `apply.html?id=${job.id}`;
                        }, 700);
                    } catch (error) {
                        setPaymentStatus(error.message || "Payment verification failed.");
                        toast(error.message || "Payment verification failed.");
                    } finally {
                        confirmBtn.disabled = false;
                    }
                },
                prefill: {
                    name: applicant.full_name,
                    email: applicant.email,
                    contact: applicant.phone
                },
                notes: {
                    job_id: job.id,
                    job_title: job.title
                },
                theme: {
                    color: "#0d2d5a"
                },
                modal: {
                    ondismiss: function () {
                        setPaymentStatus("Checkout closed before payment completion.");
                        confirmBtn.disabled = false;
                    }
                }
            });

            razorpay.on("payment.failed", function (response) {
                const message = response.error?.description || "Payment failed. Please try again.";
                setPaymentStatus(message);
                toast(message);
                confirmBtn.disabled = false;
            });

            razorpay.open();
            setPaymentStatus("Razorpay checkout opened. Complete the payment to continue.");
        } catch (error) {
            setPaymentStatus(error.message || "Unable to start payment.");
            toast(error.message || "Unable to start payment.");
            confirmBtn.disabled = false;
        }
    });
}

function trackerMarkup(app) {
    const labels = ["Submitted", "Under Review", "Shortlisted / Rejected", "Hired / Refund", "Refunded"];
    return `
        <div class="tracker">
            ${labels.map((label, index) => {
                const activeIndex = app.steps.findIndex((step) => !step);
                const cls = app.steps[index] ? "done" : index === activeIndex ? "active" : "";
                return `<div class="tracker-step ${cls}">${label}</div>`;
            }).join("")}
        </div>
    `;
}

function renderDashboard() {
    const container = qs("#dashboard-applications");
    if (!container) return;
    container.innerHTML = applications.map((app) => {
        const job = getJob(app.jobId);
        return `
            <article class="app-card">
                <div class="card-head">
                    <div><h3>${job.title}</h3><p>${job.company} · Candidate: ${app.candidate}</p></div>
                    <span class="status-pill">${app.status.replace("_", " ")}</span>
                </div>
                ${trackerMarkup(app)}
            </article>
        `;
    }).join("");
}

function renderHrDashboard() {
    const jobsList = qs("#hr-jobs-list");
    const applicantRows = qs("#hr-applicant-rows");
    if (jobsList) {
        jobsList.innerHTML = jobs.map((job) => `
            <article class="job-list-card">
                <div class="job-list-head">
                    <div><h3>${job.title}</h3><p>${job.company} · ${job.location}</p></div>
                    <span class="status-pill">${job.applicants} applicants</span>
                </div>
                <div class="hero-actions">
                    <a class="btn btn-outline" href="hr-applicants.html?jobId=${job.id}">View Applicants</a>
                    <button type="button" class="btn btn-primary" data-toast="Job edit flow is ready for backend wiring.">Edit Job</button>
                </div>
            </article>
        `).join("");
    }
    if (applicantRows) {
        applicantRows.innerHTML = applications.map((app) => {
            const job = getJob(app.jobId);
            return `
                <tr>
                    <td>${app.candidate}</td>
                    <td>${job.title}</td>
                    <td>${app.status.replace("_", " ")}</td>
                    <td><button type="button" class="btn btn-outline btn-sm" data-toast="Status update action will connect to backend later.">Update</button></td>
                </tr>
            `;
        }).join("");
    }
    qsa("[data-hr-tab]").forEach((button) => {
        button.addEventListener("click", () => {
            qsa("[data-hr-tab]").forEach((tab) => tab.classList.remove("active"));
            qsa(".tab-panel").forEach((panel) => panel.classList.remove("active"));
            button.classList.add("active");
            qs(`#hr-tab-${button.dataset.hrTab}`)?.classList.add("active");
        });
    });
    qs("#create-job-form")?.addEventListener("submit", (event) => {
        event.preventDefault();
        toast("Frontend job creation form is ready.");
    });
}

function renderHrApplicants() {
    const rows = qs("#job-applicant-rows");
    if (!rows) return;
    const job = getJob(params().get("jobId"));
    qs("#applicants-heading").textContent = `Applicants for ${job.title}`;
    rows.innerHTML = applications
        .filter((app) => app.jobId === job.id)
        .map((app) => `<tr><td>${app.candidate}</td><td>${app.experience}</td><td>${app.paymentStatus.replace("_", " ")}</td><td>${app.status.replace("_", " ")}</td></tr>`)
        .join("");
}

function initAuthForms() {
    qs("#register-form")?.addEventListener("submit", (event) => {
        event.preventDefault();
        const status = qs("#register-status");
        const client = getSupabaseClient();
        if (!client) {
            if (status) status.textContent = "Supabase URL and anon key are not added yet.";
            return toast("Supabase configuration missing.");
        }

        const fullName = qs("#register-name")?.value.trim() || "";
        const email = qs("#register-email")?.value.trim() || "";
        const phone = qs("#register-phone")?.value.trim() || "";
        const password = qs("#register-password")?.value || "";

        if (!fullName || !email || !phone || !password) {
            if (status) status.textContent = "Please fill all required fields.";
            return toast("Please fill all fields.");
        }

        if (status) status.textContent = "Creating your account...";

        client.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName,
                    phone
                }
            }
        }).then(({ data, error }) => {
            if (error) {
                if (status) status.textContent = error.message;
                return toast(error.message);
            }

            const needsConfirmation = !data.session;
            if (status) {
                status.textContent = needsConfirmation
                    ? "Account created. Check your email for confirmation."
                    : "Account created and signed in successfully.";
            }
            toast(needsConfirmation ? "Registration successful. Check your email." : "Registration successful.");

            if (!needsConfirmation) {
                window.setTimeout(() => {
                    window.location.href = "dashboard.html";
                }, 500);
            }
        }).catch((error) => {
            const message = error?.message || "Registration failed. Please check your internet connection and Supabase settings.";
            if (status) status.textContent = message;
            toast(message);
        });
    });
    qs("#login-form")?.addEventListener("submit", (event) => {
        event.preventDefault();
        const status = qs("#login-status");
        const client = getSupabaseClient();
        if (!client) {
            if (status) status.textContent = "Supabase URL and anon key are not added yet.";
            return toast("Supabase configuration missing.");
        }

        const email = qs("#login-email")?.value.trim() || "";
        const password = qs("#login-password")?.value || "";

        if (!email || !password) {
            if (status) status.textContent = "Please enter email and password.";
            return toast("Please enter email and password.");
        }

        if (status) status.textContent = "Signing in...";

        client.auth.signInWithPassword({ email, password }).then(({ error }) => {
            if (error) {
                if (status) status.textContent = error.message;
                return toast(error.message);
            }

            if (status) status.textContent = "Login successful. Opening dashboard.";
            toast("Login successful.");
            window.setTimeout(() => {
                window.location.href = "dashboard.html";
            }, 500);
        });
    });
}

function initToastButtons() {
    qsa("[data-toast]").forEach((button) => {
        button.addEventListener("click", () => toast(button.dataset.toast));
    });
}

function init() {
    initCookieBanner();
    initMenu();
    initAuthForms();
    renderFeaturedJobs();
    renderJobsPage();
    renderJobDetail();
    setupApplyPage();
    setupPaymentPage();
    renderDashboard();
    renderHrDashboard();
    renderHrApplicants();
    initToastButtons();
}

init();
