const qs = (selector) => document.querySelector(selector);
const qsa = (selector) => [...document.querySelectorAll(selector)];
const params = () => new URLSearchParams(window.location.search);

const SESSION_KEY = "hr_portal_session_v1";
const CANDIDATE_ONLY_PAGES = new Set(["dashboard", "apply"]);
const ADMIN_ONLY_PAGES = new Set(["hr-dashboard", "hr-applicants"]);
const AUTH_PAGES = new Set(["login", "register"]);
const MAX_RESUME_SIZE = 5 * 1024 * 1024;
const ALLOWED_RESUME_EXTENSIONS = [".pdf", ".doc", ".docx"];
const STATUS_OPTIONS = ["under_review", "shortlisted", "hired", "rejected"];

const jobCache = {
    active: null,
    all: null
};

function getApiBaseUrl() {
    return (window.HR_API_CONFIG?.baseUrl || "http://localhost:4000").replace(/\/+$/, "");
}

function getApiBaseCandidates() {
    const protocol = window.location.protocol === "http:" || window.location.protocol === "https:"
        ? window.location.protocol
        : "http:";
    const host = window.location.hostname || "localhost";
    const isLocalHost = host === "localhost" || host === "127.0.0.1";
    const locationOrigin = window.location.origin.replace(/\/+$/, "");
    const configuredBase = getApiBaseUrl();
    const candidates = [];

    if (isLocalHost) {
        const localBase = `${protocol}//${host}:4000`;
        candidates.push(localBase);
        if (configuredBase && configuredBase !== localBase) {
            candidates.push(configuredBase);
        }
        return [...new Set(candidates)];
    }

    // On deployed domains, always prefer same-origin API first.
    candidates.push(locationOrigin);
    if (configuredBase && configuredBase !== locationOrigin) {
        candidates.push(configuredBase);
    }
    return [...new Set(candidates)];
}

function getBackendConnectionMessage() {
    const targets = getApiBaseCandidates().join(", ");
    return `Cannot connect to backend. Tried: ${targets}.`;
}

function getCurrentPageName() {
    return document.body?.dataset?.page || "";
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatStatus(value) {
    return String(value || "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value) {
    if (!value) return "N/A";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "N/A";
    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

function roleHomePage(role) {
    return role === "hr_admin" ? "hr-dashboard.html" : "dashboard.html";
}

function getSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || !parsed.token) return null;
        return parsed;
    } catch (error) {
        return null;
    }
}

function setSession(token, user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token, user }));
}

function clearSession() {
    localStorage.removeItem(SESSION_KEY);
}

function getAuthToken() {
    return getSession()?.token || "";
}

function resolveReadableMessage(input, fallback = "Something went wrong.") {
    if (input == null) return fallback;

    if (typeof input === "string") {
        const value = input.trim();
        if (!value || value === "[object Object]") return fallback;
        return value;
    }

    if (input instanceof Error) {
        const fromMessage = resolveReadableMessage(input.message, "");
        if (fromMessage) return fromMessage;
        if (input.cause !== undefined) {
            const fromCause = resolveReadableMessage(input.cause, "");
            if (fromCause) return fromCause;
        }
        return fallback;
    }

    if (Array.isArray(input)) {
        const collected = input
            .map((entry) => resolveReadableMessage(entry, ""))
            .filter(Boolean);
        return collected.length ? collected.join("; ") : fallback;
    }

    if (typeof input === "object") {
        const keys = ["message", "detail", "error", "reason"];
        for (const key of keys) {
            if (Object.prototype.hasOwnProperty.call(input, key)) {
                const nested = resolveReadableMessage(input[key], "");
                if (nested) return nested;
            }
        }
        try {
            const serialized = JSON.stringify(input);
            if (serialized && serialized !== "{}" && serialized !== "\"[object Object]\"") {
                return serialized;
            }
        } catch {
            return fallback;
        }
        return fallback;
    }

    const raw = String(input).trim();
    if (!raw || raw === "[object Object]") return fallback;
    return raw;
}

function formatToastMessage(input) {
    return resolveReadableMessage(input, "Something went wrong.");
}

function toast(message) {
    const root = qs("#toast-root");
    if (!root) return;
    const item = document.createElement("div");
    item.className = "toast";
    item.textContent = formatToastMessage(message);
    root.appendChild(item);
    window.setTimeout(() => item.remove(), 3200);
}

function apiErrorMessage(payload, httpStatus) {
    const fallback = `Request failed (HTTP ${httpStatus}).`;
    if (!payload || typeof payload !== "object") return fallback;
    const fromDetail = resolveReadableMessage(payload.detail, "");
    if (fromDetail) return fromDetail;
    const fromMessage = resolveReadableMessage(payload.message, "");
    if (fromMessage) return fromMessage;
    const fromError = resolveReadableMessage(payload.error, "");
    if (fromError) return fromError;
    return resolveReadableMessage(payload, fallback);
}

function parseApiPayload(text, response) {
    const trimmed = String(text || "").trim();
    if (!trimmed) {
        return {};
    }
    try {
        return JSON.parse(trimmed);
    } catch {
        const hint = trimmed.slice(0, 280);
        if (!response.ok) {
            return {
                message: hint.includes("<!DOCTYPE") || hint.includes("<html")
                    ? `Server returned HTML instead of JSON (HTTP ${response.status}). The /api route may be missing on deployment — redeploy with the api/ folder or check Vercel logs.`
                    : hint || `HTTP ${response.status}`
            };
        }
        return {};
    }
}

async function apiRequest(path, options = {}) {
    const {
        method = "GET",
        body,
        formData,
        auth = true
    } = options;

    const headers = { Accept: "application/json" };
    if (auth) {
        const token = getAuthToken();
        if (!token) {
            throw new Error("Please sign in first.");
        }
        headers.Authorization = `Bearer ${token}`;
    }

    let requestBody;
    if (formData) {
        requestBody = formData;
    } else if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        requestBody = JSON.stringify(body);
    }

    const baseCandidates = getApiBaseCandidates();
    let response = null;
    let lastNetworkError = null;

    for (const baseUrl of baseCandidates) {
        try {
            response = await fetch(`${baseUrl}${path}`, {
                method,
                headers,
                body: requestBody
            });
            if (response.ok) {
                break;
            }

            // If deployed same-origin doesn't have route yet, try next candidate.
            if ((response.status === 404 || response.status === 405) && baseCandidates.length > 1) {
                response = null;
                continue;
            }
            break;
        } catch (error) {
            lastNetworkError = error;
            response = null;
        }
    }

    if (!response) {
        throw new Error(lastNetworkError?.message ? getBackendConnectionMessage() : getBackendConnectionMessage());
    }

    const text = await response.text();
    const payload = parseApiPayload(text, response);

    if (!response.ok) {
        if (response.status === 401) clearSession();
        throw new Error(apiErrorMessage(payload, response.status));
    }

    return payload;
}

async function checkApiHealth() {
    try {
        await apiRequest("/api/health", { auth: false });
        return true;
    } catch (error) {
        return false;
    }
}

async function fetchCurrentUser() {
    const session = getSession();
    if (!session?.token) return null;
    const response = await apiRequest("/api/auth/me", { auth: true });
    setSession(session.token, response.user);
    return response.user;
}

function initCookieBanner() {
    const banner = qs("#cookie-banner");
    if (!banner) return;

    if (!localStorage.getItem("hr_cookie_accept")) {
        banner.classList.add("show");
    }

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

function initRevealAnimations() {
    const items = qsa(".reveal, .card, .job-list-card, .feature-card, .panel-card, .point-card, .poster-card, .stat-box, .app-card, .role-card");
    if (!items.length) return;

    items.forEach((item, index) => {
        item.classList.add("reveal");
        item.style.transitionDelay = `${Math.min(index * 45, 220)}ms`;
    });

    if (!("IntersectionObserver" in window)) {
        items.forEach((item) => item.classList.add("in-view"));
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add("in-view");
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.14 });

    items.forEach((item) => observer.observe(item));
}

function firstRelationObject(value) {
    if (Array.isArray(value)) return value[0] || null;
    return value || null;
}

async function getJobs(includeInactive = false) {
    const key = includeInactive ? "all" : "active";
    if (jobCache[key]) return jobCache[key];

    const suffix = includeInactive ? "?all=1" : "";
    const data = await apiRequest(`/api/jobs${suffix}`, { auth: false });
    jobCache[key] = Array.isArray(data.jobs) ? data.jobs : [];
    return jobCache[key];
}

function getJobTypeLabel(jobType) {
    return formatStatus(jobType || "full_time");
}

function featuredCard(job) {
    return `
        <article class="card">
            <div class="card-head">
                <div><h3>${escapeHtml(job.title)}</h3><p>${escapeHtml(job.company_name || "Company")}</p></div>
                <span class="status-pill">${escapeHtml(getJobTypeLabel(job.job_type))}</span>
            </div>
            <div class="summary-list">
                <div class="summary-item"><span>Location</span><strong>${escapeHtml(job.location || "N/A")}</strong></div>
                <div class="summary-item"><span>Salary</span><strong>${escapeHtml(job.salary_range || "Discuss in interview")}</strong></div>
            </div>
            <a class="btn btn-primary full-width" href="job-detail.html?id=${encodeURIComponent(job.id)}">View Detail</a>
        </article>
    `;
}

function jobListCard(job) {
    const skills = Array.isArray(job.skills_required) ? job.skills_required.join(", ") : "";
    return `
        <article class="job-list-card">
            <div class="job-list-head">
                <div><h3>${escapeHtml(job.title)}</h3><p>${escapeHtml(job.company_name || "Company")} - ${escapeHtml(job.department || "General")}</p></div>
                <span class="status-pill">${escapeHtml(getJobTypeLabel(job.job_type))}</span>
            </div>
            <div class="summary-list">
                <div class="summary-item"><span>Location</span><strong>${escapeHtml(job.location || "N/A")}</strong></div>
                <div class="summary-item"><span>Type</span><strong>${escapeHtml(getJobTypeLabel(job.job_type))}</strong></div>
                <div class="summary-item"><span>Salary</span><strong>${escapeHtml(job.salary_range || "Discuss in interview")}</strong></div>
                <div class="summary-item"><span>Skills</span><strong>${escapeHtml(skills || "Not specified")}</strong></div>
            </div>
            <div class="hero-actions">
                <a class="btn btn-outline" href="job-detail.html?id=${encodeURIComponent(job.id)}">View Detail</a>
                <a class="btn btn-primary" href="apply.html?id=${encodeURIComponent(job.id)}">Apply Now</a>
            </div>
        </article>
    `;
}

async function renderFeaturedJobs() {
    const container = qs("#featured-jobs");
    if (!container) return;

    try {
        const jobs = await getJobs(false);
        if (!jobs.length) {
            container.innerHTML = `<article class="surface"><p>No active jobs found right now.</p></article>`;
            return;
        }
        container.innerHTML = jobs.slice(0, 3).map(featuredCard).join("");
        initRevealAnimations();
    } catch (error) {
        container.innerHTML = `<article class="surface"><p>${escapeHtml(error.message)}</p></article>`;
    }
}

async function renderJobsPage() {
    const container = qs("#jobs-list");
    if (!container) return;

    const search = qs("#job-search");
    const chips = qsa(".chip");
    let activeFilter = "all";
    let allJobs = [];

    function draw() {
        const query = String(search?.value || "").toLowerCase();
        const filtered = allJobs.filter((job) => {
            const matchesFilter = activeFilter === "all" || job.job_type === activeFilter;
            const text = `${job.title} ${job.location} ${job.company_name} ${(job.skills_required || []).join(" ")}`.toLowerCase();
            return matchesFilter && text.includes(query);
        });

        if (!filtered.length) {
            container.innerHTML = `<article class="surface"><p>No jobs matched your filters.</p></article>`;
        } else {
            container.innerHTML = filtered.map(jobListCard).join("");
        }
        initRevealAnimations();
    }

    chips.forEach((chip) => {
        chip.addEventListener("click", () => {
            chips.forEach((item) => item.classList.remove("active"));
            chip.classList.add("active");
            activeFilter = chip.dataset.filter || "all";
            draw();
        });
    });
    search?.addEventListener("input", draw);

    try {
        allJobs = await getJobs(false);
        draw();
    } catch (error) {
        container.innerHTML = `<article class="surface"><p>${escapeHtml(error.message)}</p></article>`;
    }
}

async function renderJobDetail() {
    const main = qs("#job-detail-main");
    const side = qs("#job-detail-side");
    if (!main || !side) return;

    try {
        const jobId = params().get("id");
        let job = null;

        if (jobId) {
            const detail = await apiRequest(`/api/jobs/${encodeURIComponent(jobId)}`, { auth: false });
            job = detail.job;
        } else {
            const jobs = await getJobs(false);
            job = jobs[0] || null;
        }

        if (!job) {
            main.innerHTML = "<h2>Job not found</h2><p>Please return to jobs and pick another role.</p>";
            side.innerHTML = `<a class="btn btn-outline full-width" href="jobs.html">Back to Jobs</a>`;
            return;
        }

        const skills = Array.isArray(job.skills_required) ? job.skills_required.join(", ") : "Not specified";
        main.innerHTML = `
            <span class="eyebrow">Job Detail</span>
            <h1>${escapeHtml(job.title)}</h1>
            <p>${escapeHtml(job.company_name || "Company")} - ${escapeHtml(job.department || "General")} - ${escapeHtml(job.location || "N/A")}</p>
            <div class="summary-list" style="margin-top:20px;">
                <div class="summary-item"><span>Description</span><strong>${escapeHtml(job.description || "No description available.")}</strong></div>
                <div class="summary-item"><span>Required Skills</span><strong>${escapeHtml(skills)}</strong></div>
                <div class="summary-item"><span>Perks</span><strong>${escapeHtml(job.perks || "As per company policy")}</strong></div>
                <div class="summary-item"><span>Salary Range</span><strong>${escapeHtml(job.salary_range || "Discuss in interview")}</strong></div>
            </div>
        `;
        side.innerHTML = `
            <span class="eyebrow">Quick Summary</span>
            <div class="summary-list">
                <div class="summary-item"><span>Job Type</span><strong>${escapeHtml(getJobTypeLabel(job.job_type))}</strong></div>
                <div class="summary-item"><span>Status</span><strong>${job.is_active ? "Open" : "Closed"}</strong></div>
                <div class="summary-item"><span>Posted By</span><strong>HR Admin</strong></div>
            </div>
            <div class="hero-actions" style="margin-top:18px;">
                <a class="btn btn-primary full-width" href="apply.html?id=${encodeURIComponent(job.id)}">Apply Now</a>
                <a class="btn btn-outline full-width" href="jobs.html">Back to Jobs</a>
            </div>
        `;
    } catch (error) {
        main.innerHTML = `<h2>Unable to load job</h2><p>${escapeHtml(error.message)}</p>`;
        side.innerHTML = `<a class="btn btn-outline full-width" href="jobs.html">Back to Jobs</a>`;
    }
}

function setupApplyStepper(form, preview) {
    const next = qs("#next-step");
    const prev = qs("#prev-step");
    const submit = qs("#submit-application");
    const steps = qsa(".form-step");
    const tabs = qsa(".stepper .step");
    let current = 0;

    function renderPreview() {
        preview.innerHTML = `
            <span class="eyebrow">Preview</span>
            <div class="summary-list">
                <div class="summary-item"><span>Name</span><strong>${escapeHtml(qs("#full_name")?.value || "Not provided")}</strong></div>
                <div class="summary-item"><span>Email</span><strong>${escapeHtml(qs("#email")?.value || "Not provided")}</strong></div>
                <div class="summary-item"><span>Phone</span><strong>${escapeHtml(qs("#phone")?.value || "Not provided")}</strong></div>
                <div class="summary-item"><span>Qualification</span><strong>${escapeHtml(qs("#qualification")?.value || "Not provided")}</strong></div>
                <div class="summary-item"><span>Experience</span><strong>${escapeHtml(qs("#experience")?.value || "Not provided")}</strong></div>
                <div class="summary-item"><span>Skills</span><strong>${escapeHtml(qs("#skills")?.value || "Not provided")}</strong></div>
            </div>
        `;
    }

    function renderStep() {
        steps.forEach((step, index) => step.classList.toggle("active", index === current));
        tabs.forEach((tab, index) => tab.classList.toggle("active", index === current));
        if (prev) prev.style.visibility = current === 0 ? "hidden" : "visible";
        if (next) next.hidden = current === steps.length - 1;
        if (submit) submit.hidden = current !== steps.length - 1;
        if (current === steps.length - 1) renderPreview();
    }

    next?.addEventListener("click", () => {
        if (current < steps.length - 1) {
            current += 1;
            renderStep();
        }
    });
    prev?.addEventListener("click", () => {
        if (current > 0) {
            current -= 1;
            renderStep();
        }
    });
    form?.addEventListener("reset", () => {
        current = 0;
        renderStep();
    });

    renderStep();
}

async function setupApplyPage(currentUser) {
    const subtitle = qs("#apply-job-subtitle");
    const form = qs("#apply-form");
    const summary = qs("#apply-job-summary");
    const preview = qs("#preview-card");
    if (!subtitle || !form || !summary || !preview) return;

    try {
        const jobs = await getJobs(false);
        if (!jobs.length) {
            subtitle.textContent = "No active jobs available right now.";
            summary.innerHTML = `<div class="summary-item"><span>Status</span><strong>Closed</strong></div>`;
            return;
        }

        const selectedJobId = params().get("id");
        const selectedJob = jobs.find((job) => job.id === selectedJobId) || jobs[0];

        subtitle.textContent = `${selectedJob.title} - ${selectedJob.company_name || "Company"}`;
        summary.innerHTML = `
            <div class="summary-item"><span>Role</span><strong>${escapeHtml(selectedJob.title)}</strong></div>
            <div class="summary-item"><span>Company</span><strong>${escapeHtml(selectedJob.company_name || "Company")}</strong></div>
            <div class="summary-item"><span>Location</span><strong>${escapeHtml(selectedJob.location || "N/A")}</strong></div>
            <div class="summary-item"><span>Status</span><strong>Open for application</strong></div>
        `;

        if (currentUser) {
            if (qs("#full_name")) qs("#full_name").value = currentUser.full_name || "";
            if (qs("#email")) qs("#email").value = currentUser.email || "";
            if (qs("#phone")) qs("#phone").value = currentUser.phone || "";
            if (qs("#dob")) qs("#dob").value = currentUser.dob || "";
            if (qs("#gender")) qs("#gender").value = currentUser.gender || "";
            if (qs("#address")) qs("#address").value = currentUser.address || "";
            if (qs("#qualification")) qs("#qualification").value = currentUser.qualification || "";
            if (qs("#experience")) qs("#experience").value = currentUser.experience_years ?? "";
            if (qs("#current_title")) qs("#current_title").value = currentUser.current_title || "";
            if (qs("#linkedin")) qs("#linkedin").value = currentUser.linkedin_url || "";
            if (qs("#skills")) {
                qs("#skills").value = Array.isArray(currentUser.skills) ? currentUser.skills.join(", ") : "";
            }
            if (currentUser.resume_url && qs("#resume-note")) {
                qs("#resume-note").innerHTML = `Resume already uploaded during registration. <a href="${escapeHtml(currentUser.resume_url)}" target="_blank" rel="noopener noreferrer">View current resume</a>.`;
            }
        }

        setupApplyStepper(form, preview);
        const submitButton = qs("#submit-application");
        form.addEventListener("submit", async (event) => {
            event.preventDefault();

            const payload = {
                job_id: selectedJob.id,
                full_name: qs("#full_name")?.value.trim() || "",
                phone: qs("#phone")?.value.trim() || "",
                dob: qs("#dob")?.value || "",
                gender: qs("#gender")?.value || "",
                address: qs("#address")?.value.trim() || "",
                qualification: qs("#qualification")?.value || "",
                experience_years: qs("#experience")?.value || "",
                current_title: qs("#current_title")?.value.trim() || "",
                skills: qs("#skills")?.value.trim() || "",
                linkedin_url: qs("#linkedin")?.value.trim() || "",
                cover_letter: qs("#cover_letter")?.value.trim() || ""
            };

            const email = qs("#email")?.value.trim() || "";
            if (!payload.full_name || !payload.phone || !email) {
                toast("Please fill name, email, and phone before submitting.");
                return;
            }

            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = "Submitting...";
            }

            try {
                await apiRequest("/api/applications", {
                    method: "POST",
                    body: payload,
                    auth: true
                });
                toast("Application submitted successfully.");
                window.setTimeout(() => {
                    window.location.href = "dashboard.html";
                }, 700);
            } catch (error) {
                toast(error.message || "Unable to submit application.");
            } finally {
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent = "Submit Application";
                }
            }
        });
    } catch (error) {
        subtitle.textContent = "Unable to load selected job.";
        summary.innerHTML = `<div class="summary-item"><span>Error</span><strong>${escapeHtml(error.message)}</strong></div>`;
    }
}

function trackerMarkup(status) {
    const labels = ["Submitted", "Under Review", "Shortlisted", "Closed"];
    let progress = 1;
    if (status === "under_review") progress = 2;
    if (status === "shortlisted") progress = 3;
    if (status === "hired" || status === "rejected") progress = 4;

    return `
        <div class="tracker">
            ${labels.map((label, index) => {
                const position = index + 1;
                const className = position < progress ? "done" : position === progress ? "active" : "";
                return `<div class="tracker-step ${className}">${label}</div>`;
            }).join("")}
        </div>
    `;
}

async function renderCandidateDashboard(currentUser) {
    const container = qs("#dashboard-applications");
    if (!container) return;

    if (qs("#candidate-greeting")) {
        qs("#candidate-greeting").textContent = currentUser?.full_name
            ? `Welcome, ${currentUser.full_name}`
            : "Welcome";
    }

    try {
        const data = await apiRequest("/api/applications/my", { auth: true });
        const applications = Array.isArray(data.applications) ? data.applications : [];

        const total = applications.length;
        const underReview = applications.filter((item) => item.status === "under_review").length;
        const shortlisted = applications.filter((item) => item.status === "shortlisted").length;
        const closed = applications.filter((item) => item.status === "hired" || item.status === "rejected").length;

        if (qs("#stat-total")) qs("#stat-total").textContent = String(total);
        if (qs("#stat-review")) qs("#stat-review").textContent = String(underReview);
        if (qs("#stat-shortlisted")) qs("#stat-shortlisted").textContent = String(shortlisted);
        if (qs("#stat-closed")) qs("#stat-closed").textContent = String(closed);

        if (!applications.length) {
            container.innerHTML = `
                <article class="surface">
                    <h3>No applications yet</h3>
                    <p>Browse active jobs and submit your first application.</p>
                    <a class="btn btn-primary" href="jobs.html">Browse Jobs</a>
                </article>
            `;
            return;
        }

        container.innerHTML = applications.map((item) => {
            const job = firstRelationObject(item.jobs);
            return `
                <article class="app-card">
                    <div class="card-head">
                        <div>
                            <h3>${escapeHtml(job?.title || "Job")}</h3>
                            <p>${escapeHtml(job?.company_name || "Company")} - ${escapeHtml(job?.location || "N/A")}</p>
                        </div>
                        <span class="status-pill">${escapeHtml(formatStatus(item.status))}</span>
                    </div>
                    <div class="summary-list">
                        <div class="summary-item"><span>Applied On</span><strong>${escapeHtml(formatDate(item.created_at))}</strong></div>
                        <div class="summary-item"><span>Type</span><strong>${escapeHtml(getJobTypeLabel(job?.job_type))}</strong></div>
                    </div>
                    ${trackerMarkup(item.status)}
                </article>
            `;
        }).join("");
        initRevealAnimations();
    } catch (error) {
        container.innerHTML = `<article class="surface"><p>${escapeHtml(error.message)}</p></article>`;
    }
}

function initHrTabs() {
    const tabs = qsa("[data-hr-tab]");
    if (!tabs.length) return;
    tabs.forEach((button) => {
        button.addEventListener("click", () => {
            tabs.forEach((tab) => tab.classList.remove("active"));
            qsa(".tab-panel").forEach((panel) => panel.classList.remove("active"));
            button.classList.add("active");
            qs(`#hr-tab-${button.dataset.hrTab}`)?.classList.add("active");
        });
    });
}

function createStatusSelect(applicationId, selectedStatus) {
    return `
        <select data-status-select="${escapeHtml(applicationId)}" class="status-select">
            ${STATUS_OPTIONS.map((option) => `
                <option value="${option}" ${option === selectedStatus ? "selected" : ""}>
                    ${formatStatus(option)}
                </option>
            `).join("")}
        </select>
    `;
}

async function renderHrDashboard() {
    const jobsList = qs("#hr-jobs-list");
    const applicantRows = qs("#hr-applicant-rows");
    const createJobForm = qs("#create-job-form");
    const applicantSearch = qs("#admin-applicant-search");
    const applicantStatus = qs("#admin-applicant-status");
    const applicantResultCount = qs("#admin-applicant-result-count");
    if (!jobsList && !applicantRows && !createJobForm && !applicantSearch && !applicantStatus) return;

    initHrTabs();

    try {
        const [jobsData, appsData] = await Promise.all([
            apiRequest("/api/jobs?all=1", { auth: true }),
            apiRequest("/api/admin/applications", { auth: true })
        ]);

        const jobs = Array.isArray(jobsData.jobs) ? jobsData.jobs : [];
        const applications = Array.isArray(appsData.applications) ? appsData.applications : [];

        const session = getSession();
        const u = session?.user;
        const welcomeHeading = qs("#admin-welcome-heading");
        const welcomeLine = qs("#admin-welcome-line");
        if (welcomeHeading && u) {
            welcomeHeading.textContent = `Hello, ${u.full_name || u.email || "Admin"}`;
        }
        if (welcomeLine && u) {
            welcomeLine.textContent =
                u.role === "hr_admin"
                    ? "Post jobs, review applications, and open candidate resumes from one place."
                    : "";
        }

        const pendingReview = applications.filter((a) => a.status === "under_review").length;
        const statJobs = qs("#admin-stat-jobs");
        const statApps = qs("#admin-stat-apps");
        const statPending = qs("#admin-stat-pending");
        if (statJobs) statJobs.textContent = String(jobs.length);
        if (statApps) statApps.textContent = String(applications.length);
        if (statPending) statPending.textContent = String(pendingReview);

        const countByJobId = new Map();
        applications.forEach((item) => {
            countByJobId.set(item.job_id, (countByJobId.get(item.job_id) || 0) + 1);
        });

        if (jobsList) {
            jobsList.innerHTML = jobs.map((job) => `
                <article class="job-list-card">
                    <div class="job-list-head">
                        <div>
                            <h3>${escapeHtml(job.title)}</h3>
                            <p>${escapeHtml(job.company_name || "Company")} - ${escapeHtml(job.location || "N/A")}</p>
                        </div>
                        <span class="status-pill">${countByJobId.get(job.id) || 0} applicants</span>
                    </div>
                    <div class="summary-list">
                        <div class="summary-item"><span>Department</span><strong>${escapeHtml(job.department || "General")}</strong></div>
                        <div class="summary-item"><span>Type</span><strong>${escapeHtml(getJobTypeLabel(job.job_type))}</strong></div>
                        <div class="summary-item"><span>Active</span><strong>${job.is_active ? "Yes" : "No"}</strong></div>
                    </div>
                    <div class="hero-actions">
                        <a class="btn btn-outline" href="hr-applicants.html?jobId=${encodeURIComponent(job.id)}">View Applicants</a>
                    </div>
                </article>
            `).join("");
        }

        const renderApplicantRows = () => {
            if (!applicantRows) return;
            const statusFilter = applicantStatus?.value || "all";
            const searchTerm = (applicantSearch?.value || "").trim().toLowerCase();

            const filteredApplications = applications.filter((item) => {
                const profile = firstRelationObject(item.profiles);
                const job = firstRelationObject(item.jobs);
                if (statusFilter !== "all" && item.status !== statusFilter) return false;
                if (!searchTerm) return true;

                const searchableText = [
                    profile?.full_name,
                    profile?.email,
                    profile?.phone,
                    profile?.qualification,
                    job?.title,
                    job?.company_name,
                    item.status
                ].filter(Boolean).join(" ").toLowerCase();

                return searchableText.includes(searchTerm);
            });

            if (applicantResultCount) {
                const total = filteredApplications.length;
                applicantResultCount.textContent = `${total} applicant${total === 1 ? "" : "s"}`;
            }

            if (!filteredApplications.length) {
                applicantRows.innerHTML = `<tr><td colspan="7">No applicants match this filter.</td></tr>`;
                return;
            }

            applicantRows.innerHTML = filteredApplications.map((item) => {
                const profile = firstRelationObject(item.profiles);
                const job = firstRelationObject(item.jobs);
                const contact = [profile?.email, profile?.phone].filter(Boolean).join(" | ");
                return `
                    <tr>
                        <td>
                            <strong>${escapeHtml(profile?.full_name || "Candidate")}</strong>
                            <div class="muted-text">${escapeHtml(profile?.qualification || "Qualification not provided")}</div>
                        </td>
                        <td>${escapeHtml(contact || "N/A")}</td>
                        <td>
                            <strong>${escapeHtml(job?.title || "Job")}</strong>
                            <div class="muted-text">${escapeHtml(job?.company_name || "Company")}</div>
                        </td>
                        <td>${escapeHtml(formatDate(item.created_at))}</td>
                        <td><span class="status-pill">${escapeHtml(formatStatus(item.status))}</span></td>
                        <td>
                            ${profile?.resume_url
                                ? `<a class="btn btn-outline btn-sm" href="${escapeHtml(profile.resume_url)}" target="_blank" rel="noopener noreferrer">Open Resume</a>`
                                : "<span class=\"muted-text\">No resume</span>"
                            }
                        </td>
                        <td class="admin-action-cell">
                            ${createStatusSelect(item.id, item.status)}
                            <button type="button" class="btn btn-primary btn-sm" data-update-status="${escapeHtml(item.id)}">Update</button>
                        </td>
                    </tr>
                `;
            }).join("");
        };

        if (applicantRows) {
            renderApplicantRows();

            if (!applicantRows.dataset.boundStatusHandler) {
                applicantRows.addEventListener("click", async (event) => {
                    const button = event.target.closest("[data-update-status]");
                    if (!button) return;
                    const applicationId = button.getAttribute("data-update-status");
                    const select = qsa("[data-status-select]").find((item) => item.getAttribute("data-status-select") === applicationId);
                    const selectedStatus = select?.value;
                    if (!selectedStatus) return;

                    const originalText = button.textContent;
                    button.disabled = true;
                    button.textContent = "Saving...";
                    try {
                        await apiRequest(`/api/admin/applications/${encodeURIComponent(applicationId)}/status`, {
                            method: "PATCH",
                            body: { status: selectedStatus },
                            auth: true
                        });
                        toast("Application status updated.");
                        await renderHrDashboard();
                    } catch (error) {
                        toast(getErrorMessage(error));
                    } finally {
                        button.disabled = false;
                        button.textContent = originalText;
                    }
                });
                applicantRows.dataset.boundStatusHandler = "1";
            }
        }

        if (applicantSearch && !applicantSearch.dataset.boundFilterHandler) {
            applicantSearch.addEventListener("input", renderApplicantRows);
            applicantSearch.dataset.boundFilterHandler = "1";
        }

        if (applicantStatus && !applicantStatus.dataset.boundFilterHandler) {
            applicantStatus.addEventListener("change", renderApplicantRows);
            applicantStatus.dataset.boundFilterHandler = "1";
        }

        if (createJobForm) {
            if (!createJobForm.dataset.boundCreateJobHandler) {
                createJobForm.addEventListener("submit", async (event) => {
                    event.preventDefault();
                    const submitButton = qs("#create-job-submit");
                    const payload = {
                        title: qs("#hr-job-title")?.value.trim() || "",
                        company_name: qs("#hr-job-company")?.value.trim() || "",
                        department: qs("#hr-job-department")?.value.trim() || "",
                        location: qs("#hr-job-location")?.value.trim() || "",
                        job_type: qs("#hr-job-type")?.value || "full_time",
                        salary_range: qs("#hr-job-salary")?.value.trim() || "",
                        skills_required: qs("#hr-job-skills")?.value.trim() || "",
                        perks: qs("#hr-job-perks")?.value.trim() || "",
                        description: qs("#hr-job-description")?.value.trim() || ""
                    };

                    if (!payload.title || !payload.location) {
                        toast("Job title and location are required.");
                        return;
                    }

                    if (submitButton) {
                        submitButton.disabled = true;
                        submitButton.textContent = "Posting...";
                    }

                    try {
                        await apiRequest("/api/jobs", {
                            method: "POST",
                            body: payload,
                            auth: true
                        });
                        toast("Job posted successfully.");
                        createJobForm.reset();
                        jobCache.active = null;
                        jobCache.all = null;
                        await renderHrDashboard();
                    } catch (error) {
                        toast(getErrorMessage(error));
                    } finally {
                        if (submitButton) {
                            submitButton.disabled = false;
                            submitButton.textContent = "Publish job";
                        }
                    }
                });
                createJobForm.dataset.boundCreateJobHandler = "1";
            }
        }

        initRevealAnimations();
    } catch (error) {
        const msg = getErrorMessage(error);
        if (jobsList) jobsList.innerHTML = `<article class="surface"><p>${escapeHtml(msg)}</p></article>`;
        if (applicantRows) applicantRows.innerHTML = `<tr><td colspan="7">${escapeHtml(msg)}</td></tr>`;
        toast(msg);
    }
}

async function renderHrApplicants() {
    const rows = qs("#job-applicant-rows");
    if (!rows) return;

    try {
        const data = await apiRequest("/api/admin/applications", { auth: true });
        const applications = Array.isArray(data.applications) ? data.applications : [];
        const filterJobId = params().get("jobId");
        const filtered = filterJobId
            ? applications.filter((item) => item.job_id === filterJobId)
            : applications;

        const heading = qs("#applicants-heading");
        if (heading) {
            if (filterJobId && filtered.length) {
                const job = firstRelationObject(filtered[0].jobs);
                heading.textContent = `Applicants for ${job?.title || "selected job"}`;
            } else {
                heading.textContent = "All applicants";
            }
        }

        if (!filtered.length) {
            rows.innerHTML = `<tr><td colspan="5">No applicants found.</td></tr>`;
            return;
        }

        rows.innerHTML = filtered.map((item) => {
            const profile = firstRelationObject(item.profiles);
            const job = firstRelationObject(item.jobs);
            return `
                <tr>
                    <td>${escapeHtml(profile?.full_name || "Candidate")}</td>
                    <td>${escapeHtml(job?.title || "Job")}</td>
                    <td>${escapeHtml(profile?.experience_years ?? "N/A")}</td>
                    <td>
                        ${profile?.resume_url
                            ? `<a class="btn btn-outline btn-sm" href="${escapeHtml(profile.resume_url)}" target="_blank" rel="noopener noreferrer">View Resume</a>`
                            : "No resume"
                        }
                    </td>
                    <td>${escapeHtml(formatStatus(item.status))}</td>
                </tr>
            `;
        }).join("");
    } catch (error) {
        rows.innerHTML = `<tr><td colspan="5">${escapeHtml(getErrorMessage(error))}</td></tr>`;
    }
}

function initLogoutActions() {
    qsa("[data-logout]").forEach((link) => {
        link.addEventListener("click", (event) => {
            event.preventDefault();
            clearSession();
            window.location.href = "login.html";
        });
    });
}

function getErrorMessage(error) {
    return formatToastMessage(error);
}

function showLoginStep(step) {
    const roleEl = qs("#auth-step-role");
    const candEl = qs("#auth-step-candidate");
    const adminEl = qs("#auth-step-admin");
    if (!roleEl || !candEl || !adminEl) return;
    roleEl.classList.toggle("is-hidden", step !== "role");
    candEl.classList.toggle("is-hidden", step !== "candidate");
    adminEl.classList.toggle("is-hidden", step !== "admin");
}

function initLoginWizard() {
    const roleEl = qs("#auth-step-role");
    if (!roleEl) return;

    qs("#btn-choose-candidate")?.addEventListener("click", () => showLoginStep("candidate"));
    qs("#btn-choose-admin")?.addEventListener("click", () => showLoginStep("admin"));
    qs("#btn-back-candidate")?.addEventListener("click", () => showLoginStep("role"));
    qs("#btn-back-admin")?.addEventListener("click", () => showLoginStep("role"));

    const hash = (window.location.hash || "").toLowerCase();
    if (hash === "#candidate") showLoginStep("candidate");
    else if (hash === "#admin") showLoginStep("admin");

    const candidateForm = qs("#candidate-login-form");
    candidateForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const status = qs("#login-status-candidate");
        const identifier = qs("#candidate-email")?.value.trim() || "";
        const password = qs("#candidate-password")?.value || "";
        if (!identifier || !password) {
            if (status) status.textContent = "Please enter email and password.";
            toast("Please enter email and password.");
            return;
        }
        const backendReady = await checkApiHealth();
        if (!backendReady) {
            const message = getBackendConnectionMessage();
            if (status) status.textContent = message;
            toast(message);
            return;
        }
        if (status) status.textContent = "Signing in…";
        const submitButton = qs("#candidate-login-submit");
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Signing in…";
        }
        try {
            const data = await apiRequest("/api/auth/login", {
                method: "POST",
                body: { role: "candidate", identifier, password },
                auth: false
            });
            if (!data.token || !data.user) {
                throw new Error(
                    "Login response was incomplete. Check that /api/health works on this server."
                );
            }
            setSession(data.token, data.user);
            if (status) status.textContent = "Success. Redirecting…";
            toast("Signed in successfully.");
            window.setTimeout(() => {
                window.location.href = roleHomePage(data.user?.role || "candidate");
            }, 400);
        } catch (error) {
            const msg = getErrorMessage(error);
            if (status) status.textContent = msg;
            toast(msg);
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = "Sign in";
            }
        }
    });

    const adminForm = qs("#admin-login-form");
    adminForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const status = qs("#login-status-admin");
        const identifier = qs("#admin-id")?.value.trim() || "";
        const password = qs("#admin-password")?.value || "";
        if (!identifier || !password) {
            if (status) status.textContent = "Please enter admin ID and password.";
            toast("Please enter admin ID and password.");
            return;
        }
        const backendReady = await checkApiHealth();
        if (!backendReady) {
            const message = getBackendConnectionMessage();
            if (status) status.textContent = message;
            toast(message);
            return;
        }
        if (status) status.textContent = "Signing in…";
        const submitButton = qs("#admin-login-submit");
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Signing in…";
        }
        try {
            const data = await apiRequest("/api/auth/login", {
                method: "POST",
                body: { role: "hr_admin", identifier, password },
                auth: false
            });
            if (!data.token || !data.user) {
                throw new Error(
                    "Login response was incomplete. Check that /api/health works on this server."
                );
            }
            setSession(data.token, data.user);
            if (status) status.textContent = "Success. Opening admin panel…";
            toast("Welcome, administrator.");
            window.setTimeout(() => {
                window.location.href = roleHomePage(data.user?.role || "hr_admin");
            }, 400);
        } catch (error) {
            const msg = getErrorMessage(error);
            if (status) status.textContent = msg;
            toast(msg);
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = "Sign in to admin panel";
            }
        }
    });
}

function initAuthForms() {
    const registerForm = qs("#register-form");

    if (registerForm) {
        registerForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const status = qs("#register-status");

            const fullName = qs("#register-name")?.value.trim() || "";
            const email = qs("#register-email")?.value.trim() || "";
            const phone = qs("#register-phone")?.value.trim() || "";
            const password = qs("#register-password")?.value || "";
            const resumeFile = qs("#register-resume")?.files?.[0] || null;

            if (!fullName || !email || !phone || !password || !resumeFile) {
                if (status) status.textContent = "Please complete all required fields including resume.";
                toast("Please complete required registration details.");
                return;
            }

            const lowerName = resumeFile.name.toLowerCase();
            const hasAllowedExtension = ALLOWED_RESUME_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
            if (!hasAllowedExtension) {
                if (status) status.textContent = "Resume must be PDF, DOC, or DOCX.";
                toast("Resume must be PDF, DOC, or DOCX.");
                return;
            }

            if (resumeFile.size > MAX_RESUME_SIZE) {
                if (status) status.textContent = "Resume must be 5MB or smaller.";
                toast("Resume must be 5MB or smaller.");
                return;
            }

            const backendReady = await checkApiHealth();
            if (!backendReady) {
                const message = getBackendConnectionMessage();
                if (status) status.textContent = message;
                toast(message);
                return;
            }

            const formData = new FormData();
            formData.append("full_name", fullName);
            formData.append("email", email);
            formData.append("phone", phone);
            formData.append("password", password);
            formData.append("dob", qs("#register-dob")?.value || "");
            formData.append("gender", qs("#register-gender")?.value || "");
            formData.append("address", qs("#register-address")?.value.trim() || "");
            formData.append("qualification", qs("#register-qualification")?.value || "");
            formData.append("experience_years", qs("#register-experience")?.value || "");
            formData.append("current_title", qs("#register-current-title")?.value.trim() || "");
            formData.append("skills", qs("#register-skills")?.value.trim() || "");
            formData.append("linkedin_url", qs("#register-linkedin")?.value.trim() || "");
            formData.append("resume", resumeFile);

            const submitButton = qs("#register-submit");
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = "Registering...";
            }
            if (status) status.textContent = "Creating your account...";

            try {
                await apiRequest("/api/auth/register", {
                    method: "POST",
                    formData,
                    auth: false
                });
                if (status) status.textContent = "Registration successful. Redirecting to login...";
                toast("Registration completed successfully.");
                window.setTimeout(() => {
                    window.location.href = "login.html";
                }, 800);
            } catch (error) {
                const msg = getErrorMessage(error);
                if (status) status.textContent = msg;
                toast(msg);
            } finally {
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent = "Register";
                }
            }
        });
    }

    initLoginWizard();
}

async function enforceRoleAccess() {
    const page = getCurrentPageName();
    const requiresCandidate = CANDIDATE_ONLY_PAGES.has(page);
    const requiresAdmin = ADMIN_ONLY_PAGES.has(page);
    const isAuthPage = AUTH_PAGES.has(page);

    const needsCheck = requiresCandidate || requiresAdmin || isAuthPage;
    if (!needsCheck) return null;

    const session = getSession();
    if (!session?.token) {
        if (requiresCandidate || requiresAdmin) {
            window.location.href = "login.html";
        }
        return null;
    }

    try {
        const user = await fetchCurrentUser();
        if (!user) {
            clearSession();
            if (requiresCandidate || requiresAdmin) {
                window.location.href = "login.html";
            }
            return null;
        }

        if (isAuthPage) {
            window.location.href = roleHomePage(user.role);
            return user;
        }

        if (requiresAdmin && user.role !== "hr_admin") {
            window.location.href = roleHomePage(user.role);
            return user;
        }

        if (requiresCandidate && user.role !== "candidate") {
            window.location.href = roleHomePage(user.role);
            return user;
        }

        return user;
    } catch (error) {
        clearSession();
        if (requiresCandidate || requiresAdmin) {
            window.location.href = "login.html";
        }
        return null;
    }
}

function initDynamicRoleCards() {
    qsa("[data-role-select]").forEach((button) => {
        button.addEventListener("click", () => {
            const targetRole = button.getAttribute("data-role-select");
            if (targetRole === "hr_admin") {
                window.location.href = "login.html#admin";
            } else if (targetRole) {
                window.location.href = "login.html#candidate";
            }
        });
    });
}

async function init() {
    initCookieBanner();
    initMenu();
    initLogoutActions();
    initDynamicRoleCards();
    initAuthForms();

    const page = getCurrentPageName();
    const currentUser = await enforceRoleAccess();
    if ((CANDIDATE_ONLY_PAGES.has(page) || ADMIN_ONLY_PAGES.has(page)) && !currentUser) {
        return;
    }

    await renderFeaturedJobs();
    await renderJobsPage();
    await renderJobDetail();
    await setupApplyPage(currentUser);
    await renderCandidateDashboard(currentUser);
    await renderHrDashboard();
    await renderHrApplicants();
    initRevealAnimations();
}

init().catch((error) => {
    console.error(error);
    toast(formatToastMessage(error));
});
