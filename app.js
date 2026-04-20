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
const OFFLINE_DB_KEY = "hr_portal_offline_db_v1";
const OFFLINE_MODE_KEY = "hr_portal_offline_mode_v1";
const DEFAULT_ADMIN_LOGIN_ID = "arvind";
const DEFAULT_ADMIN_LOGIN_PASSWORD = "arvind@123";
const DEFAULT_ADMIN_EMAIL = "arvind@gmail.com";
const DEFAULT_RESUMES_BUCKET = "resumes";
const SUPABASE_JS_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

const jobCache = {
    active: null,
    all: null
};

let offlineDbMemory = null;
let offlineModeMemory = false;
let offlineToastShown = false;
let supabaseClientPromise = null;
let hrRealtimeChannel = null;
let hrRealtimeRefreshTimer = null;
let hrRealtimeUnloadBound = false;

function storageGet(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function storageSet(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch {
        // Ignore storage write failures (private mode / blocked storage).
    }
}

function generateId() {
    if (window.crypto?.randomUUID) {
        return window.crypto.randomUUID();
    }
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseSkillsInput(rawValue) {
    if (!rawValue) return [];
    if (Array.isArray(rawValue)) {
        return rawValue.map((value) => String(value).trim()).filter(Boolean);
    }
    return String(rawValue)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
}

function parseNumberInput(rawValue) {
    if (rawValue === undefined || rawValue === null || rawValue === "") return null;
    const value = Number(rawValue);
    return Number.isFinite(value) ? value : null;
}

function normalizeGenderValue(rawValue) {
    if (!rawValue) return null;
    const value = String(rawValue).trim().toLowerCase();
    if (!["male", "female", "other"].includes(value)) return null;
    return value;
}

function mapOfflineUser(user) {
    if (!user) return null;
    return {
        id: user.id,
        full_name: user.full_name || "",
        email: user.email || "",
        phone: user.phone || "",
        role: user.role || "candidate",
        dob: user.dob || null,
        gender: user.gender || null,
        address: user.address || null,
        qualification: user.qualification || null,
        experience_years: user.experience_years ?? null,
        current_title: user.current_title || null,
        skills: Array.isArray(user.skills) ? user.skills : [],
        linkedin_url: user.linkedin_url || null,
        resume_path: user.resume_path || null,
        resume_url: user.resume_url || null,
        created_at: user.created_at || null
    };
}

function defaultOfflineJobs() {
    const now = new Date().toISOString();
    return [
        {
            id: generateId(),
            title: "Production Operator",
            company_name: "Raicam Industries",
            description: "Operate production lines and maintain output targets.",
            department: "Production",
            location: "Sanand, Gujarat",
            job_type: "full_time",
            salary_range: "Rs. 16,000 - Rs. 22,000",
            skills_required: ["Machine Operation", "Quality Check", "Assembly"],
            perks: "Bus, canteen, attendance incentives",
            is_active: true,
            created_at: now
        },
        {
            id: generateId(),
            title: "Quality Inspector",
            company_name: "Raicam Industries",
            description: "Inspect materials and finished goods, maintain quality reports.",
            department: "Quality",
            location: "Ahmedabad, Gujarat",
            job_type: "full_time",
            salary_range: "Rs. 18,000 - Rs. 24,000",
            skills_required: ["Inspection", "Documentation", "Measurement Tools"],
            perks: "Canteen, transport, uniform",
            is_active: true,
            created_at: now
        },
        {
            id: generateId(),
            title: "Warehouse Assistant",
            company_name: "Prime Logistics",
            description: "Handle inventory, dispatch, and warehouse operations.",
            department: "Operations",
            location: "Sanand, Gujarat",
            job_type: "contract",
            salary_range: "Rs. 14,000 - Rs. 18,000",
            skills_required: ["Inventory", "Packing", "Dispatch"],
            perks: "Night allowance, shift meal",
            is_active: true,
            created_at: now
        }
    ];
}

function createDefaultOfflineDb() {
    return {
        users: [],
        jobs: defaultOfflineJobs(),
        applications: [],
        tokens: {}
    };
}

function readOfflineDb() {
    if (offlineDbMemory) return offlineDbMemory;
    const raw = storageGet(OFFLINE_DB_KEY);
    if (!raw) {
        offlineDbMemory = createDefaultOfflineDb();
        storageSet(OFFLINE_DB_KEY, JSON.stringify(offlineDbMemory));
        return offlineDbMemory;
    }
    try {
        const parsed = JSON.parse(raw);
        offlineDbMemory = {
            users: Array.isArray(parsed.users) ? parsed.users : [],
            jobs: Array.isArray(parsed.jobs) ? parsed.jobs : defaultOfflineJobs(),
            applications: Array.isArray(parsed.applications) ? parsed.applications : [],
            tokens: parsed.tokens && typeof parsed.tokens === "object" ? parsed.tokens : {}
        };
        return offlineDbMemory;
    } catch {
        offlineDbMemory = createDefaultOfflineDb();
        storageSet(OFFLINE_DB_KEY, JSON.stringify(offlineDbMemory));
        return offlineDbMemory;
    }
}

function writeOfflineDb(db) {
    offlineDbMemory = db;
    storageSet(OFFLINE_DB_KEY, JSON.stringify(db));
}

function isOfflineModeEnabled() {
    return offlineModeMemory || storageGet(OFFLINE_MODE_KEY) === "1";
}

function setOfflineModeEnabled(enabled) {
    offlineModeMemory = Boolean(enabled);
    storageSet(OFFLINE_MODE_KEY, enabled ? "1" : "0");
}

function normalizeRequestPath(path) {
    const value = String(path || "");
    return value.startsWith("/") ? value : `/${value}`;
}

function supportsOfflinePath(path) {
    const url = new URL(normalizeRequestPath(path), "https://offline.local");
    let routePath = url.pathname;
    if (routePath.startsWith("/api/")) {
        routePath = routePath.slice(4);
    }
    if (!routePath.startsWith("/")) {
        routePath = `/${routePath}`;
    }
    return (
        routePath === "/health" ||
        routePath === "/auth/register" ||
        routePath === "/auth/login" ||
        routePath === "/auth/me" ||
        routePath === "/jobs" ||
        /^\/jobs\/[^/]+$/.test(routePath) ||
        routePath === "/applications" ||
        routePath === "/applications/my" ||
        routePath === "/admin/applications" ||
        /^\/admin\/applications\/[^/]+\/status$/.test(routePath)
    );
}

function isMissingApiRouteMessage(message) {
    const value = String(message || "").toLowerCase();
    if (!value) return false;
    return (
        value.includes("route not found") ||
        value.includes("the page could not be found") ||
        value.includes("server returned html instead of json") ||
        value.includes("backend api route was not found") ||
        /cannot\s+(get|post|patch|put|delete)\s+\/api/.test(value)
    );
}

function toPayloadFromFormData(formData) {
    if (!(formData instanceof FormData)) return {};
    const payload = {};
    for (const [key, value] of formData.entries()) {
        payload[key] = value;
    }
    return payload;
}

function getOfflineAuth(db, headers) {
    const authHeader = String(headers?.Authorization || headers?.authorization || "");
    if (!authHeader.startsWith("Bearer ")) return null;
    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) return null;
    return db.tokens?.[token] || null;
}

async function offlineApiRequest(path, options = {}) {
    const {
        method = "GET",
        body,
        formData,
        auth = true,
        headers = {}
    } = options;

    const requestUrl = new URL(normalizeRequestPath(path), "https://offline.local");
    let routePath = requestUrl.pathname;
    if (routePath.startsWith("/api/")) {
        routePath = routePath.slice(4);
    }
    if (!routePath.startsWith("/")) {
        routePath = `/${routePath}`;
    }

    const payload = formData ? toPayloadFromFormData(formData) : (body || {});
    const db = readOfflineDb();
    const authUser = getOfflineAuth(db, headers);
    const methodUpper = String(method || "GET").toUpperCase();

    if (auth && !authUser) {
        throw new Error("Please sign in first.");
    }

    if (methodUpper === "GET" && routePath === "/health") {
        return {
            ok: true,
            mode: "offline",
            message: "Frontend offline API mode is active."
        };
    }

    if (methodUpper === "POST" && routePath === "/auth/register") {
        const fullName = String(payload.full_name || "").trim();
        const email = String(payload.email || "").trim().toLowerCase();
        const phone = String(payload.phone || "").trim();
        const password = String(payload.password || "");
        const resumeFile = payload.resume || null;

        if (!fullName || !email || !phone || !password) {
            throw new Error("Full name, email, phone, and password are required.");
        }
        if (!resumeFile) {
            throw new Error("Resume is required during registration.");
        }
        const existing = db.users.find((item) => String(item.email || "").toLowerCase() === email);
        if (existing) {
            throw new Error("Email is already registered.");
        }

        const resumeName = typeof resumeFile === "object" && resumeFile?.name
            ? String(resumeFile.name)
            : "resume.pdf";
        const userId = generateId();
        const normalizedGender = payload.gender ? normalizeGenderValue(payload.gender) : null;
        if (payload.gender && !normalizedGender) {
            throw new Error("Gender must be male, female, or other.");
        }

        const user = {
            id: userId,
            full_name: fullName,
            email,
            phone,
            password,
            role: "candidate",
            dob: payload.dob || null,
            gender: normalizedGender,
            address: payload.address || null,
            qualification: payload.qualification || null,
            experience_years: parseNumberInput(payload.experience_years),
            current_title: payload.current_title || null,
            skills: parseSkillsInput(payload.skills),
            linkedin_url: payload.linkedin_url || null,
            resume_path: `offline/resumes/${resumeName}`,
            resume_url: `offline://resumes/${encodeURIComponent(resumeName)}`,
            created_at: new Date().toISOString()
        };

        db.users.push(user);
        writeOfflineDb(db);

        return {
            message: "Registration completed successfully.",
            user: {
                id: user.id,
                email: user.email,
                role: user.role
            }
        };
    }

    if (methodUpper === "POST" && routePath === "/auth/login") {
        const role = String(payload.role || "").trim().toLowerCase();
        const identifier = String(payload.identifier || "").trim();
        const password = String(payload.password || "");

        if (!role || !identifier || !password) {
            throw new Error("Role, login ID, and password are required.");
        }

        if (!["candidate", "hr_admin"].includes(role)) {
            throw new Error("Invalid login role.");
        }

        if (role === "hr_admin") {
            const adminId = storageGet("hr_admin_login_id") || DEFAULT_ADMIN_LOGIN_ID;
            const adminPassword = storageGet("hr_admin_login_password") || DEFAULT_ADMIN_LOGIN_PASSWORD;
            if (identifier !== adminId || password !== adminPassword) {
                throw new Error("Invalid admin ID or password.");
            }

            const token = `offline-${generateId()}`;
            db.tokens[token] = {
                id: "local-admin",
                role: "hr_admin",
                email: identifier,
                full_name: "Admin",
                localAdmin: true
            };
            writeOfflineDb(db);

            return {
                message: "Admin login successful.",
                token,
                user: {
                    id: "local-admin",
                    email: identifier,
                    full_name: "Admin",
                    role: "hr_admin"
                }
            };
        }

        const user = db.users.find((item) => {
            const emailMatch = String(item.email || "").toLowerCase() === identifier.toLowerCase();
            return emailMatch && item.password === password;
        });
        if (!user) {
            throw new Error("Invalid login credentials.");
        }
        if (user.role === "hr_admin") {
            throw new Error("This account is admin. Use admin login option.");
        }

        const token = `offline-${generateId()}`;
        db.tokens[token] = {
            id: user.id,
            role: user.role || "candidate",
            email: user.email,
            full_name: user.full_name || ""
        };
        writeOfflineDb(db);

        return {
            message: "Login successful.",
            token,
            user: {
                id: user.id,
                email: user.email,
                full_name: user.full_name || "",
                role: user.role || "candidate"
            }
        };
    }

    if (methodUpper === "GET" && routePath === "/auth/me") {
        if (!authUser) throw new Error("Please sign in first.");
        if (authUser.localAdmin || authUser.role === "hr_admin") {
            return {
                user: {
                    id: "local-admin",
                    email: authUser.email || "",
                    full_name: "Admin",
                    role: "hr_admin"
                }
            };
        }
        const user = db.users.find((item) => item.id === authUser.id);
        if (!user) {
            throw new Error("Profile not found.");
        }
        return { user: mapOfflineUser(user) };
    }

    if (methodUpper === "GET" && routePath === "/jobs") {
        const includeInactive = requestUrl.searchParams.get("all") === "1";
        if (includeInactive && authUser?.role !== "hr_admin") {
            throw new Error("Admin access required for inactive jobs.");
        }
        const jobs = db.jobs
            .filter((item) => includeInactive || item.is_active !== false)
            .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
            .map((item) => ({
                ...item,
                company_name: item.company_name || "Company"
            }));
        return { jobs };
    }

    if (methodUpper === "GET" && /^\/jobs\/[^/]+$/.test(routePath)) {
        const includeInactive = requestUrl.searchParams.get("all") === "1";
        const jobId = decodeURIComponent(routePath.slice("/jobs/".length));
        const job = db.jobs.find((item) => item.id === jobId);
        if (!job) {
            throw new Error("Job not found.");
        }
        if (!includeInactive && job.is_active === false) {
            throw new Error("Job is not active.");
        }
        return {
            job: {
                ...job,
                company_name: job.company_name || "Company"
            }
        };
    }

    if (methodUpper === "POST" && routePath === "/jobs") {
        if (authUser?.role !== "hr_admin") {
            throw new Error("You do not have permission to perform this action.");
        }
        const title = String(payload.title || "").trim();
        const location = String(payload.location || "").trim();
        if (!title || !location) {
            throw new Error("Title and location are required.");
        }

        const job = {
            id: generateId(),
            title,
            description: payload.description || null,
            department: payload.department || null,
            location,
            job_type: payload.job_type || "full_time",
            salary_range: payload.salary_range || null,
            skills_required: parseSkillsInput(payload.skills_required),
            perks: payload.perks || null,
            company_name: payload.company_name || "Raicam Industries",
            is_active: true,
            created_at: new Date().toISOString()
        };

        db.jobs.unshift(job);
        writeOfflineDb(db);
        return {
            message: "Job created.",
            job
        };
    }

    if (methodUpper === "POST" && routePath === "/applications") {
        if (authUser?.role !== "candidate") {
            throw new Error("You do not have permission to perform this action.");
        }
        const jobId = String(payload.job_id || "");
        if (!jobId) {
            throw new Error("Job ID is required.");
        }
        const user = db.users.find((item) => item.id === authUser.id);
        if (!user) {
            throw new Error("Candidate profile not found.");
        }
        const job = db.jobs.find((item) => item.id === jobId && item.is_active !== false);
        if (!job) {
            throw new Error("Selected job is not available.");
        }
        const existing = db.applications.find((item) => item.candidate_id === authUser.id && item.job_id === jobId);
        if (existing) {
            throw new Error("You have already applied for this job.");
        }

        if (payload.full_name) user.full_name = String(payload.full_name).trim();
        if (payload.phone) user.phone = String(payload.phone).trim();
        if (payload.dob) user.dob = payload.dob;
        if (payload.gender) {
            const normalized = normalizeGenderValue(payload.gender);
            if (!normalized) {
                throw new Error("Gender must be male, female, or other.");
            }
            user.gender = normalized;
        }
        if (payload.address) user.address = String(payload.address).trim();
        if (payload.qualification) user.qualification = String(payload.qualification).trim();
        if (payload.experience_years !== undefined && payload.experience_years !== null && payload.experience_years !== "") {
            const years = parseNumberInput(payload.experience_years);
            if (years === null) {
                throw new Error("Experience years must be a valid number.");
            }
            user.experience_years = years;
        }
        if (payload.current_title) user.current_title = String(payload.current_title).trim();
        if (payload.skills) user.skills = parseSkillsInput(payload.skills);
        if (payload.linkedin_url) user.linkedin_url = String(payload.linkedin_url).trim();

        const application = {
            id: generateId(),
            candidate_id: authUser.id,
            job_id: jobId,
            dob: user.dob || null,
            gender: user.gender || null,
            address: user.address || null,
            qualification: user.qualification || null,
            experience_years: parseNumberInput(user.experience_years),
            current_title: user.current_title || null,
            skills: parseSkillsInput(user.skills),
            resume_url: user.resume_url || null,
            cover_letter: payload.cover_letter || null,
            linkedin_url: user.linkedin_url || null,
            status: "under_review",
            created_at: new Date().toISOString()
        };

        db.applications.unshift(application);
        writeOfflineDb(db);

        return {
            message: "Application submitted successfully.",
            application: {
                id: application.id,
                status: application.status,
                created_at: application.created_at
            }
        };
    }

    if (methodUpper === "GET" && routePath === "/applications/my") {
        if (authUser?.role !== "candidate") {
            throw new Error("You do not have permission to perform this action.");
        }
        const applications = db.applications
            .filter((item) => item.candidate_id === authUser.id)
            .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
            .map((item) => {
                const job = db.jobs.find((jobItem) => jobItem.id === item.job_id) || null;
                return {
                    id: item.id,
                    status: item.status,
                    created_at: item.created_at,
                    job_id: item.job_id,
                    jobs: job
                        ? {
                            id: job.id,
                            title: job.title,
                            company_name: job.company_name || "Company",
                            location: job.location || null,
                            job_type: job.job_type || null,
                            salary_range: job.salary_range || null
                        }
                        : null
                };
            });
        return { applications };
    }

    if (methodUpper === "GET" && routePath === "/admin/applications") {
        if (authUser?.role !== "hr_admin") {
            throw new Error("You do not have permission to perform this action.");
        }
        const applications = db.applications
            .slice()
            .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
            .map((item) => {
                const profile = db.users.find((userItem) => userItem.id === item.candidate_id) || null;
                const job = db.jobs.find((jobItem) => jobItem.id === item.job_id) || null;
                return {
                    id: item.id,
                    status: item.status,
                    created_at: item.created_at,
                    candidate_id: item.candidate_id,
                    job_id: item.job_id,
                    profiles: profile
                        ? {
                            full_name: profile.full_name || null,
                            phone: profile.phone || null,
                            email: profile.email || null,
                            resume_url: profile.resume_url || null,
                            resume_path: profile.resume_path || null,
                            qualification: profile.qualification || null,
                            experience_years: profile.experience_years ?? null
                        }
                        : null,
                    jobs: job
                        ? {
                            id: job.id,
                            title: job.title,
                            company_name: job.company_name || "Company",
                            location: job.location || null,
                            job_type: job.job_type || null
                        }
                        : null
                };
            });
        return { applications };
    }

    if (methodUpper === "PATCH" && /^\/admin\/applications\/[^/]+\/status$/.test(routePath)) {
        if (authUser?.role !== "hr_admin") {
            throw new Error("You do not have permission to perform this action.");
        }
        const applicationId = decodeURIComponent(routePath.slice("/admin/applications/".length, -"/status".length));
        const status = String(payload.status || "");
        if (!STATUS_OPTIONS.includes(status)) {
            throw new Error("Invalid application status.");
        }
        const target = db.applications.find((item) => item.id === applicationId);
        if (!target) {
            throw new Error("Application not found.");
        }
        target.status = status;
        writeOfflineDb(db);
        return {
            message: "Application status updated.",
            application: {
                id: target.id,
                status: target.status
            }
        };
    }

    throw new Error("Route not found.");
}

function getApiBaseUrl() {
    return (window.HR_API_CONFIG?.baseUrl || "http://localhost:4000").replace(/\/+$/, "");
}

function isLikelyLocalHost(hostname) {
    if (!hostname) return true;
    const host = String(hostname).trim().toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local")) {
        return true;
    }
    if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) {
        return true;
    }
    return false;
}

function getApiBaseCandidates() {
    const protocol = window.location.protocol === "http:" || window.location.protocol === "https:"
        ? window.location.protocol
        : "http:";
    const host = window.location.hostname || "localhost";
    const isLocalHost = isLikelyLocalHost(host);
    const rawOrigin = String(window.location.origin || "");
    const locationOrigin = rawOrigin && rawOrigin !== "null"
        ? rawOrigin.replace(/\/+$/, "")
        : "";
    const configuredBase = getApiBaseUrl();
    const candidates = [];

    if (isLocalHost) {
        const localBase = `${protocol}//${host}:4000`;
        candidates.push(localBase);
        // Also try same-origin for setups like `vercel dev` or integrated API servers.
        if (locationOrigin && locationOrigin !== localBase) {
            candidates.push(locationOrigin);
        }
        if (configuredBase && configuredBase !== localBase && configuredBase !== locationOrigin) {
            candidates.push(configuredBase);
        }
        return [...new Set(candidates)];
    }

    // On deployed domains, always prefer same-origin API first.
    if (locationOrigin) {
        candidates.push(locationOrigin);
    }
    if (configuredBase && configuredBase !== locationOrigin) {
        candidates.push(configuredBase);
    }
    return [...new Set(candidates.filter(Boolean))];
}

function getApiPathCandidates(path) {
    const normalizedPath = String(path || "").startsWith("/") ? String(path || "") : `/${String(path || "")}`;
    const candidates = [normalizedPath];
    if (normalizedPath.startsWith("/api/")) {
        candidates.push(normalizedPath.slice(4));
    }
    return [...new Set(candidates)];
}

function getBackendConnectionMessage() {
    const targets = getApiBaseCandidates().join(", ");
    return `Cannot connect to backend API. Tried: ${targets}.`;
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
        if (!parsed.auth_provider) {
            parsed.auth_provider = "supabase";
        }
        return parsed;
    } catch (error) {
        return null;
    }
}

function setSession(token, user, refreshToken = "", authProvider = "supabase") {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
        token,
        user,
        refresh_token: refreshToken || "",
        auth_provider: authProvider
    }));
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
                    ? `Server returned HTML instead of JSON (HTTP ${response.status}). The /api route may be missing on deployment - redeploy with the api/ folder or check Vercel logs.`
                    : hint || `HTTP ${response.status}`
            };
        }
        return {};
    }
}

function getSupabaseConfig() {
    const config = window.HR_SUPABASE_CONFIG || {};
    return {
        url: String(config.url || "").trim(),
        anonKey: String(config.anonKey || "").trim()
    };
}

function getResumesBucket() {
    const fromAppConfig = String(window.HR_APPLICATION_CONFIG?.resumesBucket || "").trim();
    return fromAppConfig || DEFAULT_RESUMES_BUCKET;
}

function getAdminAuthConfig() {
    const config = window.HR_ADMIN_AUTH || {};
    return {
        loginId: String(config.loginId || DEFAULT_ADMIN_LOGIN_ID).trim(),
        email: String(config.email || DEFAULT_ADMIN_EMAIL).trim().toLowerCase()
    };
}

function sanitizeFileName(name) {
    return String(name || "resume.pdf")
        .replace(/[^\w.\-]+/g, "_")
        .replace(/_+/g, "_")
        .slice(0, 120);
}

function assertResumeFileAccepted(file) {
    if (!file) {
        throw new Error("Resume is required during registration.");
    }
    const lowerName = String(file.name || "").toLowerCase();
    const hasAllowedExtension = ALLOWED_RESUME_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    if (!hasAllowedExtension) {
        throw new Error("Resume must be PDF, DOC, or DOCX.");
    }
    if (file.size > MAX_RESUME_SIZE) {
        throw new Error("Resume must be 5MB or smaller.");
    }
}

function mapProfileRow(profile) {
    if (!profile) return null;
    return {
        id: profile.id,
        full_name: profile.full_name || "",
        email: profile.email || "",
        phone: profile.phone || "",
        role: profile.role || "candidate",
        dob: profile.dob || null,
        gender: profile.gender || null,
        address: profile.address || null,
        qualification: profile.qualification || null,
        experience_years: profile.experience_years ?? null,
        current_title: profile.current_title || null,
        skills: Array.isArray(profile.skills) ? profile.skills : [],
        linkedin_url: profile.linkedin_url || null,
        resume_path: profile.resume_path || null,
        resume_url: profile.resume_url || null,
        created_at: profile.created_at || null
    };
}

function toFriendlySupabaseError(error, fallback = "Request failed.") {
    if (!error) return fallback;
    const code = String(error.code || "");
    const details = String(error.details || "");
    const message = resolveReadableMessage(error.message || error.error_description || error.description, fallback);
    if (code === "23505" || /duplicate key/i.test(details) || /already exists/i.test(message)) {
        return "This record already exists.";
    }
    return message || fallback;
}

function normalizeRoute(path) {
    const requestUrl = new URL(normalizeRequestPath(path), "https://static.local");
    let routePath = requestUrl.pathname;
    if (routePath.startsWith("/api/")) {
        routePath = routePath.slice(4);
    }
    if (!routePath.startsWith("/")) {
        routePath = `/${routePath}`;
    }
    return { requestUrl, routePath };
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const existing = qsa("script[src]").find((script) => script.getAttribute("src") === src);
        if (existing) {
            if (existing.dataset.loaded === "1") {
                resolve();
                return;
            }
            existing.addEventListener("load", () => resolve(), { once: true });
            existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
            return;
        }
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.addEventListener("load", () => {
            script.dataset.loaded = "1";
            resolve();
        }, { once: true });
        script.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
        document.head.appendChild(script);
    });
}

async function ensureSupabaseClient() {
    if (supabaseClientPromise) return supabaseClientPromise;

    supabaseClientPromise = (async () => {
        if (!window.HR_SUPABASE_CONFIG) {
            await loadScript("supabase-config.js");
        }
        if (!window.supabase?.createClient) {
            await loadScript(SUPABASE_JS_CDN);
        }

        const config = getSupabaseConfig();
        if (!config.url || !config.anonKey) {
            throw new Error("Supabase URL or publishable key is missing in supabase-config.js.");
        }

        const client = window.supabase.createClient(config.url, config.anonKey, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false
            }
        });
        window.__hrSupabaseClient = client;
        return client;
    })();

    return supabaseClientPromise;
}

function ensureAdminLoginEmail(identifier) {
    const login = String(identifier || "").trim().toLowerCase();
    const config = getAdminAuthConfig();
    if (!login) {
        throw new Error("Please enter admin ID and password.");
    }
    if (login.includes("@")) {
        return login;
    }
    if (login === config.loginId.toLowerCase()) {
        return config.email || DEFAULT_ADMIN_EMAIL;
    }
    throw new Error("Invalid admin ID.");
}

async function ensureDefaultAdminBootstrap(client, email, password) {
    const adminEmail = String(email || "").trim().toLowerCase();
    const adminPassword = String(password || "");
    if (!adminEmail || !adminPassword) return null;

    // Try to create the configured default admin account if it does not exist yet.
    const signUpResponse = await client.auth.signUp({
        email: adminEmail,
        password: adminPassword,
        options: {
            data: {
                full_name: "Arvind Admin",
                role: "hr_admin"
            }
        }
    });

    let session = signUpResponse.data?.session || null;
    let user = signUpResponse.data?.user || signUpResponse.data?.session?.user || null;

    if (signUpResponse.error) {
        const message = String(signUpResponse.error.message || "").toLowerCase();
        const alreadyRegistered =
            message.includes("already registered") ||
            message.includes("already been registered") ||
            message.includes("user already");
        if (!alreadyRegistered) {
            return null;
        }
    }

    if (!session) {
        const signInRetry = await client.auth.signInWithPassword({
            email: adminEmail,
            password: adminPassword
        });
        if (signInRetry.error || !signInRetry.data?.session) {
            return null;
        }
        session = signInRetry.data.session;
        user = signInRetry.data.user || signInRetry.data.session.user;
    }

    if (!session?.user?.id && !user?.id) {
        return null;
    }

    const userId = session?.user?.id || user.id;
    await client
        .from("profiles")
        .update({
            role: "hr_admin",
            email: adminEmail,
            full_name: "Arvind Admin"
        })
        .eq("id", userId);

    return {
        data: {
            session,
            user: user || session.user
        },
        error: null
    };
}

async function createSignedResumeUrl(client, resumePath) {
    if (!resumePath) return null;
    const { data, error } = await client.storage
        .from(getResumesBucket())
        .createSignedUrl(resumePath, 60 * 60);
    if (error || !data?.signedUrl) {
        return null;
    }
    return data.signedUrl;
}

async function fetchProfileById(client, userId) {
    const { data, error } = await client
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
    if (error) {
        throw new Error(toFriendlySupabaseError(error, "Unable to load profile."));
    }
    return data || null;
}

async function enrichApplicationsWithResumeUrls(client, applications) {
    const rows = Array.isArray(applications) ? applications : [];
    const resumePaths = new Set();
    rows.forEach((item) => {
        const profile = firstRelationObject(item?.profiles);
        if (profile?.resume_path) {
            resumePaths.add(profile.resume_path);
        }
    });

    const signedUrlMap = new Map();
    await Promise.all([...resumePaths].map(async (resumePath) => {
        const signedUrl = await createSignedResumeUrl(client, resumePath);
        if (signedUrl) {
            signedUrlMap.set(resumePath, signedUrl);
        }
    }));

    return rows.map((item) => {
        const profile = firstRelationObject(item?.profiles);
        if (!profile) return item;

        const signedUrl = profile.resume_path ? signedUrlMap.get(profile.resume_path) : null;
        if (!signedUrl) return item;

        const nextProfile = { ...profile, resume_url: signedUrl };
        return {
            ...item,
            profiles: Array.isArray(item.profiles) ? [nextProfile] : nextProfile
        };
    });
}

async function getSignedInContext(requiredRole = null) {
    const localSession = getSession();
    if (!localSession?.token || localSession.auth_provider !== "supabase") {
        throw new Error("Please sign in first.");
    }

    const refreshToken = String(localSession.refresh_token || "").trim();
    if (!refreshToken) {
        clearSession();
        throw new Error("Session expired. Please sign in again.");
    }

    const client = await ensureSupabaseClient();
    const { data, error } = await client.auth.setSession({
        access_token: localSession.token,
        refresh_token: refreshToken
    });
    if (error || !data?.session?.user) {
        clearSession();
        throw new Error("Session expired. Please sign in again.");
    }

    const profile = await fetchProfileById(client, data.session.user.id);
    if (!profile) {
        clearSession();
        throw new Error("Profile not found. Please sign in again.");
    }

    if (requiredRole && profile.role !== requiredRole) {
        throw new Error("You do not have permission to perform this action.");
    }

    const mappedProfile = mapProfileRow(profile);
    const signedResumeUrl = await createSignedResumeUrl(client, mappedProfile.resume_path);
    if (signedResumeUrl) {
        mappedProfile.resume_url = signedResumeUrl;
    }

    setSession(data.session.access_token, mappedProfile, data.session.refresh_token, "supabase");
    return { client, authSession: data.session, profile: mappedProfile };
}

async function signOutSupabaseQuietly() {
    const localSession = getSession();
    if (!localSession || localSession.auth_provider !== "supabase") {
        return;
    }
    try {
        const client = await ensureSupabaseClient();
        await client.auth.signOut();
    } catch {
        // Ignore sign-out failures and clear local session anyway.
    }
}

async function supabaseApiRequest(path, options = {}) {
    const {
        method = "GET",
        body,
        formData,
        auth = true
    } = options;

    const { requestUrl, routePath } = normalizeRoute(path);
    const payload = formData ? toPayloadFromFormData(formData) : (body || {});
    const methodUpper = String(method || "GET").toUpperCase();
    const client = await ensureSupabaseClient();

    if (methodUpper === "GET" && routePath === "/health") {
        return {
            ok: true,
            mode: "supabase_static",
            message: "Static frontend is connected directly to Supabase."
        };
    }

    if (methodUpper === "POST" && routePath === "/auth/register") {
        const fullName = String(payload.full_name || "").trim();
        const email = String(payload.email || "").trim().toLowerCase();
        const phone = String(payload.phone || "").trim();
        const password = String(payload.password || "");
        const resumeFile = payload.resume || null;
        const normalizedGender = payload.gender ? normalizeGenderValue(payload.gender) : null;
        const rawExperience = payload.experience_years;
        const experienceYears = parseNumberInput(rawExperience);

        if (!fullName || !email || !phone || !password) {
            throw new Error("Full name, email, phone, and password are required.");
        }
        if (payload.gender && !normalizedGender) {
            throw new Error("Gender must be male, female, or other.");
        }
        if (rawExperience !== undefined && rawExperience !== null && rawExperience !== "" && experienceYears === null) {
            throw new Error("Experience years must be a valid number.");
        }
        assertResumeFileAccepted(resumeFile);

        const signUpResponse = await client.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName,
                    phone,
                    role: "candidate"
                }
            }
        });
        if (signUpResponse.error) {
            throw new Error(toFriendlySupabaseError(signUpResponse.error, "Unable to register candidate."));
        }

        let signInSession = signUpResponse.data.session || null;
        let signInUser = signUpResponse.data.user || signUpResponse.data.session?.user || null;

        if (!signInSession) {
            const loginResponse = await client.auth.signInWithPassword({ email, password });
            if (loginResponse.error || !loginResponse.data.session) {
                throw new Error("Registration created. Please verify your email, then sign in.");
            }
            signInSession = loginResponse.data.session;
            signInUser = loginResponse.data.user || loginResponse.data.session.user;
        }

        if (!signInSession?.access_token || !signInSession?.refresh_token || !signInUser?.id) {
            throw new Error("Registration succeeded but session setup failed. Please try signing in.");
        }

        const setSessionResponse = await client.auth.setSession({
            access_token: signInSession.access_token,
            refresh_token: signInSession.refresh_token
        });
        if (setSessionResponse.error) {
            throw new Error(toFriendlySupabaseError(setSessionResponse.error, "Unable to finalize registration session."));
        }

        const userId = signInUser.id;
        const resumePath = `profiles/${userId}/${Date.now()}-${sanitizeFileName(resumeFile.name)}`;
        const uploadResponse = await client.storage
            .from(getResumesBucket())
            .upload(resumePath, resumeFile, {
                upsert: true,
                contentType: resumeFile.type || "application/octet-stream"
            });
        if (uploadResponse.error) {
            throw new Error(toFriendlySupabaseError(uploadResponse.error, "Unable to upload resume."));
        }

        const resumeUrl = await createSignedResumeUrl(client, resumePath);
        const updatePayload = {
            full_name: fullName,
            email,
            phone,
            dob: payload.dob || null,
            gender: normalizedGender,
            address: payload.address ? String(payload.address).trim() : null,
            qualification: payload.qualification ? String(payload.qualification).trim() : null,
            experience_years: experienceYears,
            current_title: payload.current_title ? String(payload.current_title).trim() : null,
            skills: parseSkillsInput(payload.skills),
            linkedin_url: payload.linkedin_url ? String(payload.linkedin_url).trim() : null,
            resume_path: resumePath,
            resume_url: resumeUrl
        };
        const profileUpdate = await client
            .from("profiles")
            .update(updatePayload)
            .eq("id", userId);
        if (profileUpdate.error) {
            throw new Error(toFriendlySupabaseError(profileUpdate.error, "Unable to save candidate profile."));
        }

        await client.auth.signOut();
        return {
            message: "Registration completed successfully.",
            user: {
                id: userId,
                email,
                role: "candidate"
            }
        };
    }

    if (methodUpper === "POST" && routePath === "/auth/login") {
        const role = String(payload.role || "").trim().toLowerCase();
        const identifier = String(payload.identifier || "").trim();
        const password = String(payload.password || "");

        if (!role || !identifier || !password) {
            throw new Error("Role, login ID, and password are required.");
        }
        if (!["candidate", "hr_admin"].includes(role)) {
            throw new Error("Invalid login role.");
        }

        const email = role === "hr_admin"
            ? ensureAdminLoginEmail(identifier)
            : String(identifier).toLowerCase();
        if (role === "candidate" && !email.includes("@")) {
            throw new Error("Please enter your registered email address.");
        }

        const normalizedIdentifier = String(identifier || "").trim().toLowerCase();
        const isDefaultAdminAttempt =
            role === "hr_admin" &&
            password === DEFAULT_ADMIN_LOGIN_PASSWORD &&
            (
                normalizedIdentifier === DEFAULT_ADMIN_LOGIN_ID.toLowerCase() ||
                normalizedIdentifier === DEFAULT_ADMIN_EMAIL.toLowerCase() ||
                normalizedIdentifier === String(email || "").toLowerCase()
            );

        let signInResponse = await client.auth.signInWithPassword({ email, password });
        if ((signInResponse.error || !signInResponse.data?.session) && isDefaultAdminAttempt) {
            const bootstrapResponse = await ensureDefaultAdminBootstrap(client, String(email || DEFAULT_ADMIN_EMAIL), password);
            if (bootstrapResponse?.data?.session) {
                signInResponse = await client.auth.signInWithPassword({
                    email: String(email || DEFAULT_ADMIN_EMAIL),
                    password
                });
                if (signInResponse.error || !signInResponse.data?.session) {
                    signInResponse = bootstrapResponse;
                }
            }
        }

        if (signInResponse.error || !signInResponse.data.session) {
            throw new Error(
                role === "hr_admin"
                    ? "Invalid admin ID or password."
                    : toFriendlySupabaseError(signInResponse.error, "Invalid login credentials.")
            );
        }

        const authUser = signInResponse.data.user || signInResponse.data.session.user;
        const profile = await fetchProfileById(client, authUser.id);
        if (!profile) {
            await client.auth.signOut();
            throw new Error("Profile not found. Contact HR support.");
        }

        if (role === "candidate" && profile.role !== "candidate") {
            await client.auth.signOut();
            throw new Error("This account is admin. Use admin login option.");
        }

        if (role === "hr_admin" && profile.role !== "hr_admin") {
            await client.auth.signOut();
            throw new Error("Invalid admin ID or password.");
        }

        const mapped = mapProfileRow(profile);
        const signedResumeUrl = await createSignedResumeUrl(client, mapped.resume_path);
        if (signedResumeUrl) {
            mapped.resume_url = signedResumeUrl;
        }

        setSession(
            signInResponse.data.session.access_token,
            mapped,
            signInResponse.data.session.refresh_token,
            "supabase"
        );

        return {
            message: role === "hr_admin" ? "Admin login successful." : "Login successful.",
            token: signInResponse.data.session.access_token,
            refresh_token: signInResponse.data.session.refresh_token,
            auth_provider: "supabase",
            user: mapped
        };
    }

    if (methodUpper === "GET" && routePath === "/auth/me") {
        if (!auth) {
            throw new Error("Authentication required.");
        }
        const context = await getSignedInContext();
        return { user: context.profile };
    }

    if (methodUpper === "GET" && routePath === "/jobs") {
        const includeInactive = requestUrl.searchParams.get("all") === "1";

        if (includeInactive) {
            await getSignedInContext("hr_admin");
        }

        let query = client
            .from("jobs")
            .select("*")
            .order("created_at", { ascending: false });
        if (!includeInactive) {
            query = query.eq("is_active", true);
        }

        const { data, error } = await query;
        if (error) {
            throw new Error(toFriendlySupabaseError(error, "Unable to load jobs."));
        }

        return { jobs: Array.isArray(data) ? data : [] };
    }

    if (methodUpper === "GET" && /^\/jobs\/[^/]+$/.test(routePath)) {
        const includeInactive = requestUrl.searchParams.get("all") === "1";
        const jobId = decodeURIComponent(routePath.slice("/jobs/".length));

        if (includeInactive) {
            await getSignedInContext("hr_admin");
        }

        let query = client
            .from("jobs")
            .select("*")
            .eq("id", jobId)
            .limit(1)
            .maybeSingle();
        if (!includeInactive) {
            query = query.eq("is_active", true);
        }

        const { data, error } = await query;
        if (error) {
            throw new Error(toFriendlySupabaseError(error, "Unable to load selected job."));
        }
        if (!data) {
            throw new Error("Job not found.");
        }

        return { job: data };
    }

    if (methodUpper === "POST" && routePath === "/jobs") {
        const context = await getSignedInContext("hr_admin");
        if (!context.profile || context.profile.role !== "hr_admin") {
            throw new Error("You do not have permission to perform this action.");
        }

        const title = String(payload.title || "").trim();
        const location = String(payload.location || "").trim();
        if (!title || !location) {
            throw new Error("Title and location are required.");
        }

        const createResponse = await client
            .from("jobs")
            .insert({
                title,
                company_name: String(payload.company_name || "").trim() || "Raicam Industries",
                description: String(payload.description || "").trim() || null,
                department: String(payload.department || "").trim() || null,
                location,
                job_type: String(payload.job_type || "full_time"),
                salary_range: String(payload.salary_range || "").trim() || null,
                skills_required: parseSkillsInput(payload.skills_required),
                perks: String(payload.perks || "").trim() || null,
                is_active: true
            })
            .select("*")
            .single();
        if (createResponse.error) {
            throw new Error(toFriendlySupabaseError(createResponse.error, "Unable to create job."));
        }

        jobCache.active = null;
        jobCache.all = null;
        return {
            message: "Job created.",
            job: createResponse.data
        };
    }

    if (methodUpper === "POST" && routePath === "/applications") {
        const context = await getSignedInContext("candidate");
        const jobId = String(payload.job_id || "").trim();
        if (!jobId) {
            throw new Error("Job ID is required.");
        }

        const gender = payload.gender ? normalizeGenderValue(payload.gender) : context.profile.gender;
        if (payload.gender && !gender) {
            throw new Error("Gender must be male, female, or other.");
        }

        const rawExperience = payload.experience_years;
        const hasExperienceInput = rawExperience !== undefined && rawExperience !== null && rawExperience !== "";
        const experienceYears = hasExperienceInput ? parseNumberInput(rawExperience) : context.profile.experience_years;
        if (hasExperienceInput && experienceYears === null) {
            throw new Error("Experience years must be a valid number.");
        }

        const { data: jobRow, error: jobError } = await client
            .from("jobs")
            .select("id,title,is_active")
            .eq("id", jobId)
            .eq("is_active", true)
            .limit(1)
            .maybeSingle();
        if (jobError) {
            throw new Error(toFriendlySupabaseError(jobError, "Unable to validate selected job."));
        }
        if (!jobRow) {
            throw new Error("Selected job is not available.");
        }

        const profileUpdates = {};
        if (payload.full_name) profileUpdates.full_name = String(payload.full_name).trim();
        if (payload.phone) profileUpdates.phone = String(payload.phone).trim();
        if (payload.dob !== undefined) profileUpdates.dob = payload.dob || null;
        if (payload.gender !== undefined) profileUpdates.gender = gender || null;
        if (payload.address !== undefined) profileUpdates.address = payload.address ? String(payload.address).trim() : null;
        if (payload.qualification !== undefined) profileUpdates.qualification = payload.qualification ? String(payload.qualification).trim() : null;
        if (hasExperienceInput) profileUpdates.experience_years = experienceYears;
        if (payload.current_title !== undefined) profileUpdates.current_title = payload.current_title ? String(payload.current_title).trim() : null;
        if (payload.skills !== undefined) profileUpdates.skills = parseSkillsInput(payload.skills);
        if (payload.linkedin_url !== undefined) profileUpdates.linkedin_url = payload.linkedin_url ? String(payload.linkedin_url).trim() : null;

        if (Object.keys(profileUpdates).length) {
            const profileUpdate = await client
                .from("profiles")
                .update(profileUpdates)
                .eq("id", context.profile.id);
            if (profileUpdate.error) {
                throw new Error(toFriendlySupabaseError(profileUpdate.error, "Unable to update profile details."));
            }
        }

        const mergedProfile = {
            ...context.profile,
            ...profileUpdates
        };

        const applicationInsert = await client
            .from("applications")
            .insert({
                candidate_id: context.profile.id,
                job_id: jobId,
                dob: mergedProfile.dob || null,
                gender: mergedProfile.gender || null,
                address: mergedProfile.address || null,
                qualification: mergedProfile.qualification || null,
                experience_years: mergedProfile.experience_years ?? null,
                current_title: mergedProfile.current_title || null,
                skills: Array.isArray(mergedProfile.skills) ? mergedProfile.skills : [],
                resume_url: mergedProfile.resume_url || null,
                cover_letter: payload.cover_letter ? String(payload.cover_letter).trim() : null,
                linkedin_url: mergedProfile.linkedin_url || null,
                status: "under_review"
            })
            .select("id,status,created_at")
            .single();

        if (applicationInsert.error) {
            const errorMessage = toFriendlySupabaseError(applicationInsert.error, "Unable to submit application.");
            if (/duplicate|already exists/i.test(errorMessage)) {
                throw new Error("You have already applied for this job.");
            }
            throw new Error(errorMessage);
        }

        jobCache.active = null;
        jobCache.all = null;
        return {
            message: "Application submitted successfully.",
            application: applicationInsert.data
        };
    }

    if (methodUpper === "GET" && routePath === "/applications/my") {
        const context = await getSignedInContext("candidate");
        const { data, error } = await client
            .from("applications")
            .select("id,status,created_at,job_id,jobs!applications_job_id_fkey(id,title,company_name,location,job_type,salary_range)")
            .eq("candidate_id", context.profile.id)
            .order("created_at", { ascending: false });
        if (error) {
            throw new Error(toFriendlySupabaseError(error, "Unable to load your applications."));
        }
        return { applications: Array.isArray(data) ? data : [] };
    }

    if (methodUpper === "GET" && routePath === "/admin/applications") {
        await getSignedInContext("hr_admin");
        const { data, error } = await client
            .from("applications")
            .select("id,status,created_at,candidate_id,job_id,profiles!applications_candidate_id_fkey(full_name,phone,email,resume_url,resume_path,qualification,experience_years),jobs!applications_job_id_fkey(id,title,company_name,location,job_type)")
            .order("created_at", { ascending: false });
        if (error) {
            throw new Error(toFriendlySupabaseError(error, "Unable to load admin applications."));
        }

        const enriched = await enrichApplicationsWithResumeUrls(client, data || []);
        return { applications: enriched };
    }

    if (methodUpper === "PATCH" && /^\/admin\/applications\/[^/]+\/status$/.test(routePath)) {
        await getSignedInContext("hr_admin");
        const applicationId = decodeURIComponent(routePath.slice("/admin/applications/".length, -"/status".length));
        const status = String(payload.status || "");
        if (!STATUS_OPTIONS.includes(status)) {
            throw new Error("Invalid application status.");
        }

        const updateResponse = await client
            .from("applications")
            .update({ status })
            .eq("id", applicationId)
            .select("id,status")
            .single();
        if (updateResponse.error) {
            throw new Error(toFriendlySupabaseError(updateResponse.error, "Unable to update application status."));
        }

        return {
            message: "Application status updated.",
            application: updateResponse.data
        };
    }

    throw new Error("Route not found.");
}

async function apiRequest(path, options = {}) {
    return supabaseApiRequest(path, options);
}

async function checkApiHealth() {
    try {
        const response = await apiRequest("/api/health", { auth: false });
        if (response && response.ok === false) {
            return { ok: false, error: new Error("Service health check failed.") };
        }
        return { ok: true };
    } catch (error) {
        return { ok: false, error };
    }
}

async function fetchCurrentUser() {
    const session = getSession();
    if (!session?.token) return null;
    const response = await apiRequest("/api/auth/me", { auth: true });
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

    const activateTab = (tabKey) => {
        if (!tabKey) return;
        tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.hrTab === tabKey));
        qsa(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.id === `hr-tab-${tabKey}`));
    };

    tabs.forEach((button) => {
        if (button.dataset.boundHrTab === "1") return;
        button.addEventListener("click", () => activateTab(button.dataset.hrTab || ""));
        button.dataset.boundHrTab = "1";
    });

    qsa("[data-hr-tab-jump]").forEach((button) => {
        if (button.dataset.boundHrTabJump === "1") return;
        button.addEventListener("click", () => activateTab(button.getAttribute("data-hr-tab-jump") || ""));
        button.dataset.boundHrTabJump = "1";
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

function scheduleHrRealtimeRefresh() {
    if (hrRealtimeRefreshTimer) {
        window.clearTimeout(hrRealtimeRefreshTimer);
    }
    hrRealtimeRefreshTimer = window.setTimeout(async () => {
        hrRealtimeRefreshTimer = null;
        jobCache.active = null;
        jobCache.all = null;
        await renderHrDashboard();
        await renderHrApplicants();
    }, 220);
}

async function initHrRealtimeSubscription() {
    const page = getCurrentPageName();
    if (page !== "hr-dashboard" && page !== "hr-applicants") {
        return;
    }

    const session = getSession();
    if (!session?.user || session.user.role !== "hr_admin") {
        return;
    }

    const client = await ensureSupabaseClient();
    if (hrRealtimeChannel) {
        return;
    }

    hrRealtimeChannel = client
        .channel("hr-applications-live")
        .on("postgres_changes", { event: "*", schema: "public", table: "applications" }, () => {
            scheduleHrRealtimeRefresh();
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, () => {
            scheduleHrRealtimeRefresh();
        })
        .subscribe();

    if (!hrRealtimeUnloadBound) {
        window.addEventListener("beforeunload", () => {
            if (hrRealtimeChannel && window.__hrSupabaseClient) {
                window.__hrSupabaseClient.removeChannel(hrRealtimeChannel);
                hrRealtimeChannel = null;
            }
        });
        hrRealtimeUnloadBound = true;
    }
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
        const shortlistedCount = applications.filter((a) => a.status === "shortlisted").length;
        const closedCount = applications.filter((a) => a.status === "hired" || a.status === "rejected").length;
        const statJobs = qs("#admin-stat-jobs");
        const statApps = qs("#admin-stat-apps");
        const statPending = qs("#admin-stat-pending");
        const statShortlisted = qs("#admin-stat-shortlisted");
        const statClosed = qs("#admin-stat-closed");
        if (statJobs) statJobs.textContent = String(jobs.length);
        if (statApps) statApps.textContent = String(applications.length);
        if (statPending) statPending.textContent = String(pendingReview);
        if (statShortlisted) statShortlisted.textContent = String(shortlistedCount);
        if (statClosed) statClosed.textContent = String(closedCount);

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
        link.addEventListener("click", async (event) => {
            event.preventDefault();
            if (hrRealtimeChannel && window.__hrSupabaseClient) {
                window.__hrSupabaseClient.removeChannel(hrRealtimeChannel);
                hrRealtimeChannel = null;
            }
            await signOutSupabaseQuietly();
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

function getPostLoginRedirect(defaultPath) {
    const nextRaw = String(params().get("next") || "").trim();
    if (!nextRaw) return defaultPath;
    if (/^https?:/i.test(nextRaw) || nextRaw.startsWith("//")) return defaultPath;
    if (!nextRaw.endsWith(".html") && !nextRaw.includes(".html?")) return defaultPath;
    return nextRaw;
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
        if (status) status.textContent = "Signing in...";
        const submitButton = qs("#candidate-login-submit");
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Signing in...";
        }
        try {
            const data = await apiRequest("/api/auth/login", {
                method: "POST",
                body: { role: "candidate", identifier, password },
                auth: false
            });
            if (!data.token || !data.user) {
                throw new Error(
                    "Login response was incomplete."
                );
            }
            setSession(
                data.token,
                data.user,
                String(data.refresh_token || ""),
                String(data.auth_provider || "supabase")
            );
            if (status) status.textContent = "Success. Redirecting...";
            toast("Signed in successfully.");
            window.setTimeout(() => {
                window.location.href = getPostLoginRedirect(roleHomePage(data.user?.role || "candidate"));
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
        if (status) status.textContent = "Signing in...";
        const submitButton = qs("#admin-login-submit");
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Signing in...";
        }
        try {
            const data = await apiRequest("/api/auth/login", {
                method: "POST",
                body: { role: "hr_admin", identifier, password },
                auth: false
            });
            if (!data.token || !data.user) {
                throw new Error(
                    "Login response was incomplete."
                );
            }
            setSession(
                data.token,
                data.user,
                String(data.refresh_token || ""),
                String(data.auth_provider || "supabase")
            );
            if (status) status.textContent = "Success. Opening admin panel...";
            toast("Welcome, administrator.");
            window.setTimeout(() => {
                window.location.href = getPostLoginRedirect("hr-dashboard.html");
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

function buildLoginRedirect(targetRole) {
    const pageFile = window.location.pathname.split("/").filter(Boolean).pop() || "index.html";
    const next = encodeURIComponent(`${pageFile}${window.location.search || ""}`);
    return targetRole === "hr_admin"
        ? `login.html?next=${next}#admin`
        : `login.html?next=${next}#candidate`;
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
        if (requiresAdmin) {
            window.location.href = buildLoginRedirect("hr_admin");
        } else if (requiresCandidate) {
            window.location.href = buildLoginRedirect("candidate");
        }
        return null;
    }

    try {
        const user = await fetchCurrentUser();
        if (!user) {
            clearSession();
            if (requiresAdmin) {
                window.location.href = buildLoginRedirect("hr_admin");
            } else if (requiresCandidate) {
                window.location.href = buildLoginRedirect("candidate");
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
        if (requiresAdmin) {
            window.location.href = buildLoginRedirect("hr_admin");
        } else if (requiresCandidate) {
            window.location.href = buildLoginRedirect("candidate");
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
    await initHrRealtimeSubscription();
    initRevealAnimations();
}

init().catch((error) => {
    console.error(error);
    toast(formatToastMessage(error));
});

