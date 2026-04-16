const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const DB_PATH = path.join(os.tmpdir(), "hr-portal-vercel-db.json");
const UPLOADS_ROOT = path.join(os.tmpdir(), "hr-portal-uploads");
const RESUMES_DIR = path.join(UPLOADS_ROOT, "resumes");

const TOKEN_SECRET = process.env.JWT_SECRET || "vercel_local_secret_change_me";
const ADMIN_LOGIN_ID = process.env.ADMIN_LOGIN_ID || "admin";
const ADMIN_LOGIN_PASSWORD = process.env.ADMIN_LOGIN_PASSWORD || "admin123";

const ALLOWED_STATUSES = new Set(["under_review", "shortlisted", "hired", "rejected"]);
const ALLOWED_GENDERS = new Set(["male", "female", "other"]);

function ensureStorage() {
  if (!fs.existsSync(path.dirname(DB_PATH))) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }
  if (!fs.existsSync(UPLOADS_ROOT)) {
    fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
  }
  if (!fs.existsSync(RESUMES_DIR)) {
    fs.mkdirSync(RESUMES_DIR, { recursive: true });
  }
}

function defaultJobs() {
  const now = new Date().toISOString();
  return [
    {
      id: crypto.randomUUID(),
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
      id: crypto.randomUUID(),
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
    }
  ];
}

function initDbIfMissing() {
  ensureStorage();
  if (!fs.existsSync(DB_PATH)) {
    const initial = {
      users: [],
      jobs: defaultJobs(),
      applications: []
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2), "utf8");
  }
}

function readDb() {
  initDbIfMissing();
  try {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
      applications: Array.isArray(parsed.applications) ? parsed.applications : []
    };
  } catch (error) {
    return { users: [], jobs: defaultJobs(), applications: [] };
  }
}

function writeDb(db) {
  initDbIfMissing();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Vary", "Origin");
}

function getRequestBaseUrl(req) {
  const protocol = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = req.headers.host || "localhost";
  return `${protocol}://${host}`;
}

function safeFileName(value) {
  return String(value || "resume")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "resume";
}

function parseSkills(rawValue) {
  if (!rawValue) return [];
  if (Array.isArray(rawValue)) {
    return rawValue.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(rawValue)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseNumber(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === "") return null;
  const n = Number(rawValue);
  return Number.isFinite(n) ? n : null;
}

function parseGender(rawValue) {
  if (!rawValue) return null;
  const g = String(rawValue).trim().toLowerCase();
  return ALLOWED_GENDERS.has(g) ? g : null;
}

function normalizeRole(rawValue) {
  return String(rawValue || "").trim().toLowerCase();
}

function base64UrlEncode(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(input) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function makeToken(payload, ttlSeconds = 24 * 60 * 60) {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify({
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds
  }));
  const signature = crypto
    .createHmac("sha256", TOKEN_SECRET)
    .update(`${header}.${body}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  if (!token) return null;
  const parts = String(token).split(".");
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const expected = crypto
    .createHmac("sha256", TOKEN_SECRET)
    .update(`${header}.${body}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  if (signature !== expected) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(body));
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch (error) {
    return null;
  }
}

function getAuthPayload(req) {
  const header = String(req.headers.authorization || "");
  const [prefix, token] = header.split(" ");
  if (prefix !== "Bearer" || !token) return null;
  return verifyToken(token);
}

function requireAuth(req, res) {
  const auth = getAuthPayload(req);
  if (!auth) {
    sendJson(res, 401, { message: "Missing or invalid authorization token." });
    return null;
  }
  return auth;
}

function requireRole(req, res, role) {
  const auth = requireAuth(req, res);
  if (!auth) return null;
  if (auth.role !== role) {
    sendJson(res, 403, { message: "You do not have permission to perform this action." });
    return null;
  }
  return auth;
}

const MAX_BODY_BYTES = 12 * 1024 * 1024;

/**
 * Vercel Node runtimes: use classic stream events — `for await (req)` can throw
 * (async iterable not supported / flaky), causing FUNCTION_INVOCATION_FAILED.
 */
async function readRawBody(req) {
  if (req.method === "GET" || req.method === "HEAD") {
    return Buffer.alloc(0);
  }

  if (req.body && Buffer.isBuffer(req.body)) {
    if (req.body.length > MAX_BODY_BYTES) {
      throw new Error("Request body too large.");
    }
    return req.body;
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    const ok = (buf) => {
      if (settled) return;
      settled = true;
      resolve(buf);
    };
    req.on("data", (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > MAX_BODY_BYTES) {
        try {
          req.destroy();
        } catch (_) {
          /* ignore */
        }
        fail(new Error("Request body too large."));
        return;
      }
      chunks.push(buf);
    });
    req.on("end", () => ok(Buffer.concat(chunks)));
    req.on("error", fail);
  });
}

function parseMultipart(buffer, contentType) {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) {
    return { fields: {}, files: [] };
  }
  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const raw = buffer.toString("binary");
  const boundaryToken = `--${boundary}`;
  const parts = raw.split(boundaryToken);

  const fields = {};
  const files = [];

  for (const part of parts) {
    if (!part || part === "--" || part === "--\r\n") continue;
    const trimmed = part.replace(/^\r\n/, "").replace(/\r\n--$/, "").replace(/\r\n$/, "");
    if (!trimmed) continue;
    const splitIndex = trimmed.indexOf("\r\n\r\n");
    if (splitIndex < 0) continue;

    const headerText = trimmed.slice(0, splitIndex);
    const bodyBinary = trimmed.slice(splitIndex + 4);
    const headers = headerText.split("\r\n");
    const disposition = headers.find((line) => /^content-disposition:/i.test(line)) || "";
    const contentTypeLine = headers.find((line) => /^content-type:/i.test(line)) || "";

    const nameMatch = disposition.match(/name="([^"]+)"/i);
    if (!nameMatch) continue;
    const fieldName = nameMatch[1];
    const fileMatch = disposition.match(/filename="([^"]*)"/i);
    if (fileMatch && fileMatch[1]) {
      files.push({
        fieldName,
        filename: fileMatch[1],
        contentType: contentTypeLine.replace(/^content-type:\s*/i, "").trim() || "application/octet-stream",
        buffer: Buffer.from(bodyBinary, "binary")
      });
    } else {
      fields[fieldName] = Buffer.from(bodyBinary, "binary").toString("utf8");
    }
  }

  return { fields, files };
}

async function parseRequest(req) {
  const rawBody = await readRawBody(req);
  const contentType = String(req.headers["content-type"] || "").toLowerCase();

  if (!rawBody.length) {
    return { body: {}, file: null };
  }

  if (contentType.includes("application/json")) {
    try {
      return { body: JSON.parse(rawBody.toString("utf8")), file: null };
    } catch (error) {
      return { body: {}, file: null };
    }
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(rawBody.toString("utf8"));
    return { body: Object.fromEntries(params.entries()), file: null };
  }

  if (contentType.includes("multipart/form-data")) {
    const parsed = parseMultipart(rawBody, contentType);
    const resumeFile = parsed.files.find((file) => file.fieldName === "resume") || null;
    return { body: parsed.fields, file: resumeFile };
  }

  return { body: {}, file: null };
}

function saveResumeFile(fullName, userId, file) {
  ensureStorage();
  const extension = file.filename.includes(".")
    ? file.filename.split(".").pop().toLowerCase()
    : "pdf";
  const fileName = `${userId}-${Date.now()}-${safeFileName(fullName)}.${extension}`;
  const absolutePath = path.join(RESUMES_DIR, fileName);
  fs.writeFileSync(absolutePath, file.buffer);
  return {
    resume_file_name: fileName,
    resume_path: `uploads/resumes/${fileName}`
  };
}

function getResumeUrl(req, resumeFileName) {
  if (!resumeFileName) return null;
  return `${getRequestBaseUrl(req)}/api/uploads/resumes/${encodeURIComponent(resumeFileName)}`;
}

function mapUserResponse(req, user) {
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
    resume_url: getResumeUrl(req, user.resume_file_name),
    created_at: user.created_at || null
  };
}

function handleUploadsRoute(req, res, apiPath) {
  if (!apiPath.startsWith("/uploads/resumes/")) return false;
  const fileName = decodeURIComponent(apiPath.slice("/uploads/resumes/".length));
  if (!fileName || fileName.includes("/") || fileName.includes("\\")) {
    sendJson(res, 404, { message: "File not found." });
    return true;
  }
  const absPath = path.join(RESUMES_DIR, fileName);
  if (!fs.existsSync(absPath)) {
    sendJson(res, 404, { message: "File not found." });
    return true;
  }
  const ext = fileName.split(".").pop().toLowerCase();
  const contentType = ext === "pdf"
    ? "application/pdf"
    : ext === "doc"
      ? "application/msword"
      : ext === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/octet-stream";
  res.statusCode = 200;
  res.setHeader("Content-Type", contentType);
  const stream = fs.createReadStream(absPath);
  stream.on("error", () => {
    if (!res.headersSent) {
      sendJson(res, 500, { message: "Could not read file." });
    } else {
      res.end();
    }
  });
  stream.pipe(res);
  return true;
}

module.exports = async (req, res) => {
  try {
    if (!req || typeof req.on !== "function") {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ message: "Invalid request (expected Node.js IncomingMessage)." }));
      return;
    }

    setCorsHeaders(req, res);
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    try {
      initDbIfMissing();
    } catch (storageErr) {
      console.error("Storage init failed:", storageErr);
      sendJson(res, 500, { message: "Storage initialization failed.", detail: storageErr?.message || String(storageErr) });
      return;
    }

    const rawPath = (typeof req.url === "string" && req.url.length ? req.url : "/") || "/";
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "localhost").split(",")[0].trim();
    let requestUrl;
    try {
      requestUrl = new URL(rawPath, `https://${host}`);
    } catch {
      requestUrl = new URL("/", `https://${host}`);
    }
    let pathname = "/";
    try {
      pathname = requestUrl.pathname || "/";
    } catch {
      pathname = "/";
    }
    pathname = (pathname || "/").replace(/\/+$/, "") || "/";
    const apiPath = pathname.startsWith("/api") ? (pathname.slice(4) || "/") : pathname;

    if (handleUploadsRoute(req, res, apiPath)) return;

    if (req.method === "GET" && apiPath === "/health") {
      sendJson(res, 200, {
        ok: true,
        mode: "vercel-local",
        message: "HR portal backend is running."
      });
      return;
    }

    if (req.method === "POST" && apiPath === "/auth/register") {
      const { body, file } = await parseRequest(req);
      const fullName = String(body.full_name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const phone = String(body.phone || "").trim();
      const password = String(body.password || "");

      if (!fullName || !email || !phone || !password) {
        sendJson(res, 400, { message: "Full name, email, phone, and password are required." });
        return;
      }
      if (!file) {
        sendJson(res, 400, { message: "Resume is required during registration." });
        return;
      }

      const db = readDb();
      const existing = db.users.find((item) => String(item.email || "").toLowerCase() === email);
      if (existing) {
        sendJson(res, 409, { message: "Email is already registered." });
        return;
      }

      const userId = crypto.randomUUID();
      const resumeInfo = saveResumeFile(fullName, userId, file);
      const gender = body.gender ? parseGender(body.gender) : null;
      if (body.gender && !gender) {
        sendJson(res, 400, { message: "Gender must be male, female, or other." });
        return;
      }

      const user = {
        id: userId,
        full_name: fullName,
        email,
        phone,
        password,
        role: "candidate",
        dob: body.dob || null,
        gender,
        address: body.address || null,
        qualification: body.qualification || null,
        experience_years: parseNumber(body.experience_years),
        current_title: body.current_title || null,
        skills: parseSkills(body.skills),
        linkedin_url: body.linkedin_url || null,
        resume_path: resumeInfo.resume_path,
        resume_file_name: resumeInfo.resume_file_name,
        created_at: new Date().toISOString()
      };

      db.users.push(user);
      writeDb(db);
      sendJson(res, 201, {
        message: "Registration completed successfully.",
        user: {
          id: user.id,
          email: user.email,
          role: user.role
        }
      });
      return;
    }

    if (req.method === "POST" && apiPath === "/auth/login") {
      const { body } = await parseRequest(req);
      const role = normalizeRole(body.role);
      const identifier = String(body.identifier || "").trim();
      const password = String(body.password || "");

      if (!role || !identifier || !password) {
        sendJson(res, 400, { message: "Role, login ID, and password are required." });
        return;
      }
      if (!["candidate", "hr_admin"].includes(role)) {
        sendJson(res, 400, { message: "Invalid login role." });
        return;
      }

      if (role === "hr_admin") {
        if (identifier === ADMIN_LOGIN_ID && password === ADMIN_LOGIN_PASSWORD) {
          const token = makeToken({
            sub: "local-admin",
            role: "hr_admin",
            email: identifier,
            localAdmin: true
          });
          sendJson(res, 200, {
            message: "Admin login successful.",
            token,
            user: {
              id: "local-admin",
              email: identifier,
              full_name: "Admin",
              role: "hr_admin"
            }
          });
          return;
        }
        sendJson(res, 401, { message: "Invalid admin ID or password." });
        return;
      }

      const db = readDb();
      const user = db.users.find((item) => {
        return String(item.email || "").toLowerCase() === identifier.toLowerCase() && item.password === password;
      });

      if (!user) {
        sendJson(res, 401, { message: "Invalid login credentials." });
        return;
      }

      const token = makeToken({
        sub: user.id,
        role: user.role || "candidate",
        email: user.email
      });
      sendJson(res, 200, {
        message: "Login successful.",
        token,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name || "",
          role: user.role || "candidate"
        }
      });
      return;
    }

    if (req.method === "GET" && apiPath === "/auth/me") {
      const auth = requireAuth(req, res);
      if (!auth) return;

      if (auth.localAdmin) {
        sendJson(res, 200, {
          user: {
            id: "local-admin",
            email: auth.email || "",
            full_name: "Admin",
            role: "hr_admin"
          }
        });
        return;
      }

      const db = readDb();
      const user = db.users.find((item) => item.id === auth.sub);
      if (!user) {
        sendJson(res, 404, { message: "Profile not found." });
        return;
      }
      sendJson(res, 200, { user: mapUserResponse(req, user) });
      return;
    }

    if (req.method === "GET" && apiPath === "/jobs") {
      const includeInactive = requestUrl.searchParams.get("all") === "1";
      if (includeInactive) {
        const auth = requireRole(req, res, "hr_admin");
        if (!auth) return;
      }
      const db = readDb();
      const jobs = db.jobs
        .filter((job) => includeInactive || job.is_active !== false)
        .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
        .map((job) => ({
          ...job,
          company_name: job.company_name || "Company"
        }));
      sendJson(res, 200, { jobs });
      return;
    }

    if (req.method === "GET" && apiPath.startsWith("/jobs/")) {
      const includeInactive = requestUrl.searchParams.get("all") === "1";
      if (includeInactive) {
        const auth = requireRole(req, res, "hr_admin");
        if (!auth) return;
      }

      const jobId = decodeURIComponent(apiPath.slice("/jobs/".length));
      const db = readDb();
      const job = db.jobs.find((item) => item.id === jobId);
      if (!job) {
        sendJson(res, 404, { message: "Job not found." });
        return;
      }
      if (!includeInactive && job.is_active === false) {
        sendJson(res, 404, { message: "Job is not active." });
        return;
      }
      sendJson(res, 200, {
        job: {
          ...job,
          company_name: job.company_name || "Company"
        }
      });
      return;
    }

    if (req.method === "POST" && apiPath === "/jobs") {
      const auth = requireRole(req, res, "hr_admin");
      if (!auth) return;
      const { body } = await parseRequest(req);
      const title = String(body.title || "").trim();
      const location = String(body.location || "").trim();
      if (!title || !location) {
        sendJson(res, 400, { message: "Title and location are required." });
        return;
      }

      const db = readDb();
      const job = {
        id: crypto.randomUUID(),
        title,
        description: body.description || null,
        department: body.department || null,
        location,
        job_type: body.job_type || "full_time",
        salary_range: body.salary_range || null,
        skills_required: parseSkills(body.skills_required),
        perks: body.perks || null,
        company_name: body.company_name || "Raicam Industries",
        is_active: true,
        created_at: new Date().toISOString()
      };

      db.jobs.unshift(job);
      writeDb(db);
      sendJson(res, 201, { message: "Job created.", job });
      return;
    }

    if (req.method === "POST" && apiPath === "/applications") {
      const auth = requireRole(req, res, "candidate");
      if (!auth) return;

      const { body } = await parseRequest(req);
      const jobId = String(body.job_id || "");
      if (!jobId) {
        sendJson(res, 400, { message: "Job ID is required." });
        return;
      }

      const db = readDb();
      const user = db.users.find((item) => item.id === auth.sub);
      if (!user) {
        sendJson(res, 404, { message: "Candidate profile not found." });
        return;
      }

      const job = db.jobs.find((item) => item.id === jobId && item.is_active !== false);
      if (!job) {
        sendJson(res, 404, { message: "Selected job is not available." });
        return;
      }

      const existing = db.applications.find((item) => item.candidate_id === auth.sub && item.job_id === jobId);
      if (existing) {
        sendJson(res, 409, { message: "You have already applied for this job." });
        return;
      }

      if (body.full_name) user.full_name = String(body.full_name).trim();
      if (body.phone) user.phone = String(body.phone).trim();
      if (body.dob) user.dob = body.dob;
      if (body.gender) {
        const normalized = parseGender(body.gender);
        if (!normalized) {
          sendJson(res, 400, { message: "Gender must be male, female, or other." });
          return;
        }
        user.gender = normalized;
      }
      if (body.address) user.address = String(body.address).trim();
      if (body.qualification) user.qualification = String(body.qualification).trim();
      if (body.experience_years !== undefined && body.experience_years !== null && body.experience_years !== "") {
        const parsed = parseNumber(body.experience_years);
        if (parsed === null) {
          sendJson(res, 400, { message: "Experience years must be a valid number." });
          return;
        }
        user.experience_years = parsed;
      }
      if (body.current_title) user.current_title = String(body.current_title).trim();
      if (body.skills) user.skills = parseSkills(body.skills);
      if (body.linkedin_url) user.linkedin_url = String(body.linkedin_url).trim();

      const parsedSkills = parseSkills(body.skills);
      const finalSkills = parsedSkills.length > 0 ? parsedSkills : parseSkills(user.skills);
      const parsedExperience = parseNumber(body.experience_years);
      const finalExperience = parsedExperience !== null ? parsedExperience : parseNumber(user.experience_years);

      const application = {
        id: crypto.randomUUID(),
        candidate_id: auth.sub,
        job_id: jobId,
        dob: user.dob || null,
        gender: parseGender(user.gender) || null,
        address: user.address || null,
        qualification: user.qualification || null,
        experience_years: finalExperience,
        current_title: body.current_title || user.current_title || null,
        skills: finalSkills,
        resume_url: getResumeUrl(req, user.resume_file_name),
        cover_letter: body.cover_letter || null,
        linkedin_url: body.linkedin_url || user.linkedin_url || null,
        status: "under_review",
        created_at: new Date().toISOString()
      };

      db.applications.unshift(application);
      writeDb(db);
      sendJson(res, 201, {
        message: "Application submitted successfully.",
        application: {
          id: application.id,
          status: application.status,
          created_at: application.created_at
        }
      });
      return;
    }

    if (req.method === "GET" && apiPath === "/applications/my") {
      const auth = requireRole(req, res, "candidate");
      if (!auth) return;

      const db = readDb();
      const applications = db.applications
        .filter((item) => item.candidate_id === auth.sub)
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
      sendJson(res, 200, { applications });
      return;
    }

    if (req.method === "GET" && apiPath === "/admin/applications") {
      const auth = requireRole(req, res, "hr_admin");
      if (!auth) return;

      const db = readDb();
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
                resume_url: getResumeUrl(req, profile.resume_file_name),
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
      sendJson(res, 200, { applications });
      return;
    }

    if (req.method === "PATCH" && apiPath.startsWith("/admin/applications/") && apiPath.endsWith("/status")) {
      const auth = requireRole(req, res, "hr_admin");
      if (!auth) return;

      const appId = decodeURIComponent(apiPath.slice("/admin/applications/".length, -"/status".length));
      const { body } = await parseRequest(req);
      const status = String(body.status || "");
      if (!ALLOWED_STATUSES.has(status)) {
        sendJson(res, 400, { message: "Invalid application status." });
        return;
      }

      const db = readDb();
      const index = db.applications.findIndex((item) => item.id === appId);
      if (index < 0) {
        sendJson(res, 404, { message: "Application not found." });
        return;
      }
      db.applications[index].status = status;
      writeDb(db);
      sendJson(res, 200, {
        message: "Application status updated.",
        application: {
          id: db.applications[index].id,
          status: db.applications[index].status
        }
      });
      return;
    }

    sendJson(res, 404, { message: "Route not found." });
  } catch (error) {
    console.error("Serverless handler crash:", error);
    sendJson(res, 500, {
      message: "Internal server error.",
      detail: error?.message || "Unknown error"
    });
  }
};
