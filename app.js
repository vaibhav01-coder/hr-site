const jobs = [
    {
        id: "raicam-10th-12th",
        company: "RAICAM",
        title: "Production Helper",
        education: "10th / 12th Pass",
        salary: "Rs. 14,160",
        shift: "26 Days/Month",
        perks: "Free Canteen",
        vacancies: "Open"
    },
    {
        id: "raicam-iti-diploma",
        company: "RAICAM",
        title: "Machine Operator",
        education: "ITI / Diploma",
        salary: "Rs. 17,221",
        shift: "26 Days/Month",
        perks: "Free Canteen",
        vacancies: "Open"
    },
    {
        id: "ppap-8hr",
        company: "PPAP",
        title: "Factory Worker",
        education: "Any",
        salary: "Rs. 15,700",
        shift: "8 Hours Shift",
        perks: "Free Room + Canteen + Bus",
        vacancies: "Open"
    },
    {
        id: "ppap-12hr",
        company: "PPAP",
        title: "Factory Worker",
        education: "Any",
        salary: "Rs. 23,200",
        shift: "12 Hours Shift",
        perks: "Free Room + Canteen + Bus",
        vacancies: "Open"
    },
    {
        id: "mnc-sanand",
        company: "MNC Sanand",
        title: "Diploma / ITI Operator",
        education: "Diploma / ITI",
        salary: "Rs. 21,000 - Rs. 23,000",
        shift: "8 Hrs / 24 Days",
        perks: "Free Canteen + Transport",
        vacancies: "50"
    }
];

const page = document.body.dataset.page;

function getJobById(jobId) {
    return jobs.find((job) => job.id === jobId);
}

function createJobCard(job) {
    return `
        <article class="card">
            <div class="card-header">
                <div>
                    <h3>${job.company} - ${job.title}</h3>
                    <p>${job.education}</p>
                </div>
                <span class="badge">${job.vacancies} vacancies</span>
            </div>
            <div class="meta-list">
                <div class="meta-row"><strong>Salary</strong><span>${job.salary}</span></div>
                <div class="meta-row"><strong>Shift</strong><span>${job.shift}</span></div>
                <div class="meta-row"><strong>Perks</strong><span>${job.perks}</span></div>
            </div>
            <a class="button button-primary" href="apply.html?job=${encodeURIComponent(job.id)}">Apply Now</a>
        </article>
    `;
}

function renderJobs() {
    const list = document.getElementById("job-list");
    if (!list) {
        return;
    }

    list.innerHTML = jobs.map(createJobCard).join("");
}

function fillJobSummary(job) {
    const title = document.getElementById("selected-job-text");
    const summary = document.getElementById("job-summary");

    if (!title || !summary) {
        return;
    }

    if (!job) {
        title.textContent = "No job selected. Please go back and choose a job first.";
        summary.innerHTML = `<div><dt>Status</dt><dd>No job selected</dd></div>`;
        return;
    }

    title.textContent = `${job.company} - ${job.title}`;
    summary.innerHTML = `
        <div><dt>Company</dt><dd>${job.company}</dd></div>
        <div><dt>Role</dt><dd>${job.title}</dd></div>
        <div><dt>Education</dt><dd>${job.education}</dd></div>
        <div><dt>Salary</dt><dd>${job.salary}</dd></div>
        <div><dt>Shift</dt><dd>${job.shift}</dd></div>
        <div><dt>Perks</dt><dd>${job.perks}</dd></div>
    `;
}

function setFieldError(name, message) {
    const errorNode = document.querySelector(`[data-error-for="${name}"]`);
    if (errorNode) {
        errorNode.textContent = message;
    }
}

function clearErrors(form) {
    form.querySelectorAll(".error-text").forEach((node) => {
        node.textContent = "";
    });
}

function validateForm(form) {
    clearErrors(form);

    const formData = new FormData(form);
    let isValid = true;

    const requiredFields = [
        ["full_name", "Please enter your full name."],
        ["mobile", "Please enter your mobile number."],
        ["whatsapp", "Please enter your WhatsApp number."],
        ["age", "Please enter your age."],
        ["city", "Please enter your city."],
        ["qualification", "Please select your qualification."],
        ["trade", "Please enter your trade."],
        ["shift_pref", "Please select your shift preference."]
    ];

    requiredFields.forEach(([name, message]) => {
        if (!String(formData.get(name) || "").trim()) {
            setFieldError(name, message);
            isValid = false;
        }
    });

    const mobile = String(formData.get("mobile") || "").trim();
    const whatsapp = String(formData.get("whatsapp") || "").trim();
    const age = Number(formData.get("age"));
    const resumeInput = document.getElementById("resume");
    const resumeFile = resumeInput && resumeInput.files ? resumeInput.files[0] : null;

    if (mobile && !/^\d{10}$/.test(mobile)) {
        setFieldError("mobile", "Mobile number must be 10 digits.");
        isValid = false;
    }

    if (whatsapp && !/^\d{10}$/.test(whatsapp)) {
        setFieldError("whatsapp", "WhatsApp number must be 10 digits.");
        isValid = false;
    }

    if (formData.get("age") && (Number.isNaN(age) || age < 18 || age > 60)) {
        setFieldError("age", "Age must be between 18 and 60.");
        isValid = false;
    }

    if (resumeFile && resumeFile.type && resumeFile.type !== "application/pdf") {
        setFieldError("resume", "Only PDF resume is allowed.");
        isValid = false;
    }

    return isValid;
}

function setupApplyPage() {
    const params = new URLSearchParams(window.location.search);
    const jobId = params.get("job");
    const selectedJob = getJobById(jobId);
    const form = document.getElementById("application-form");
    const paymentCheckbox = document.getElementById("confirm-payment");
    const payButton = document.getElementById("pay-now-btn");
    const submitButton = document.getElementById("submit-btn");
    const paymentStatus = document.getElementById("payment-status");

    fillJobSummary(selectedJob);

    if (!selectedJob && submitButton) {
        submitButton.disabled = true;
    }

    function syncSubmitState(paymentDone) {
        const canSubmit = Boolean(selectedJob) && paymentDone;
        submitButton.disabled = !canSubmit;
    }

    payButton.addEventListener("click", () => {
        if (!paymentCheckbox.checked) {
            paymentStatus.textContent = "Please tick the payment confirmation box first.";
            paymentStatus.style.color = "var(--red)";
            syncSubmitState(false);
            return;
        }

        paymentStatus.textContent = "Payment step marked as complete. You can now submit the application.";
        paymentStatus.style.color = "var(--green-dark)";
        syncSubmitState(true);
    });

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        const paymentReady = paymentStatus.textContent.includes("marked as complete");
        const valid = validateForm(form);

        if (!selectedJob) {
            paymentStatus.textContent = "Please select a job from the home page first.";
            paymentStatus.style.color = "var(--red)";
            return;
        }

        if (!paymentReady) {
            paymentStatus.textContent = "Please complete the payment step before submitting.";
            paymentStatus.style.color = "var(--red)";
            syncSubmitState(false);
            return;
        }

        if (!valid) {
            paymentStatus.textContent = "Please fix the form errors and submit again.";
            paymentStatus.style.color = "var(--red)";
            return;
        }

        const formData = new FormData(form);
        const savedApplication = {
            jobId: selectedJob.id,
            jobLabel: `${selectedJob.company} - ${selectedJob.title}`,
            fullName: String(formData.get("full_name") || "").trim(),
            mobile: String(formData.get("mobile") || "").trim(),
            submittedAt: new Date().toISOString(),
            resumeName: formData.get("resume") && formData.get("resume").name ? formData.get("resume").name : ""
        };

        localStorage.setItem("latestApplication", JSON.stringify(savedApplication));
        window.location.href = "thank-you.html";
    });
}

function setupThankYouPage() {
    const target = document.getElementById("thank-you-job");
    if (!target) {
        return;
    }

    const latestApplication = localStorage.getItem("latestApplication");
    if (!latestApplication) {
        target.textContent = "Your application details are ready for HR follow-up.";
        return;
    }

    const parsed = JSON.parse(latestApplication);
    target.textContent = `Applied Job: ${parsed.jobLabel} | Candidate: ${parsed.fullName} | Mobile: ${parsed.mobile}`;
}

if (page === "home") {
    renderJobs();
}

if (page === "apply") {
    setupApplyPage();
}

if (page === "thank-you") {
    setupThankYouPage();
}
