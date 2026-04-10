const express = require("express");
const cors = require("cors");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const config = require("./config");
const { serviceClient, authClient } = require("./supabase");
const { requireAuth, requireRole } = require("./auth-middleware");

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

const ALLOWED_ROLES = new Set(["candidate", "hr_admin"]);
const ALLOWED_APPLICATION_STATUSES = new Set(["under_review", "shortlisted", "hired", "rejected"]);
const ALLOWED_GENDERS = new Set(["male", "female", "other"]);
const ALLOWED_RESUME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);

app.use(cors({
  origin: config.frontendOrigin === "*" ? true : config.frontendOrigin,
  credentials: false
}));
app.use(express.json({ limit: "8mb" }));

function makeToken(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "24h" });
}

function getOptionalAuthPayload(req) {
  const authHeader = String(req.headers.authorization || "");
  const [prefix, token] = authHeader.split(" ");
  if (prefix !== "Bearer" || !token) return null;
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch (error) {
    return null;
  }
}

function getJobCompany(job) {
  return job.company_name || job.company || "Company";
}

function parseSkills(rawValue) {
  if (!rawValue) return [];
  if (Array.isArray(rawValue)) {
    return rawValue.map((value) => String(value).trim()).filter(Boolean);
  }
  return String(rawValue)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseNumber(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === "") return null;
  const numberValue = Number(rawValue);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function parseGender(rawValue) {
  if (!rawValue) return null;
  const normalized = String(rawValue).trim().toLowerCase();
  return ALLOWED_GENDERS.has(normalized) ? normalized : null;
}

function normalizeRole(rawValue) {
  return String(rawValue || "").trim().toLowerCase();
}

function safeFileName(value) {
  return String(value || "resume")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "resume";
}

function firstRelationObject(value) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

async function createResumeSignedUrl(resumePath, expiresInSeconds = 60 * 60 * 24) {
  if (!resumePath) return null;
  const signed = await serviceClient.storage
    .from(config.resumesBucket)
    .createSignedUrl(resumePath, expiresInSeconds);
  if (signed.error) return null;
  return signed.data.signedUrl;
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "HR portal backend is running." });
});

app.post("/api/auth/register", upload.single("resume"), async (req, res) => {
  let createdUserId = null;
  try {
    const {
      full_name,
      email,
      phone,
      password,
      dob,
      gender,
      address,
      qualification,
      experience_years,
      current_title,
      skills,
      linkedin_url
    } = req.body || {};

    if (!full_name || !email || !phone || !password) {
      return res.status(400).json({ message: "Full name, email, phone, and password are required." });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Resume is required during registration." });
    }

    if (req.file.mimetype && !ALLOWED_RESUME_TYPES.has(req.file.mimetype)) {
      return res.status(400).json({ message: "Resume must be PDF, DOC, or DOCX format." });
    }

    const normalEmail = String(email).trim().toLowerCase();
    const normalGender = gender ? parseGender(gender) : null;
    if (gender && !normalGender) {
      return res.status(400).json({ message: "Gender must be male, female, or other." });
    }

    const userCreate = await serviceClient.auth.admin.createUser({
      email: normalEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: String(full_name).trim(),
        phone: String(phone).trim(),
        role: "candidate"
      }
    });

    if (userCreate.error || !userCreate.data.user) {
      return res.status(400).json({ message: userCreate.error?.message || "Unable to create account." });
    }

    createdUserId = userCreate.data.user.id;
    const resumeExt = req.file.originalname.includes(".")
      ? req.file.originalname.split(".").pop().toLowerCase()
      : "pdf";
    const resumePath = `profiles/${createdUserId}/${Date.now()}-${safeFileName(full_name)}.${resumeExt}`;

    const resumeUpload = await serviceClient.storage
      .from(config.resumesBucket)
      .upload(resumePath, req.file.buffer, {
        contentType: req.file.mimetype || "application/octet-stream",
        upsert: false
      });

    if (resumeUpload.error) {
      throw new Error(resumeUpload.error.message);
    }

    const signedResumeUrl = await createResumeSignedUrl(resumePath, 60 * 60 * 24 * 30);
    const profileInsert = await serviceClient
      .from("profiles")
      .upsert({
        id: createdUserId,
        full_name: String(full_name).trim(),
        email: normalEmail,
        phone: String(phone).trim(),
        role: "candidate",
        dob: dob || null,
        gender: normalGender,
        address: address || null,
        qualification: qualification || null,
        experience_years: parseNumber(experience_years),
        current_title: current_title || null,
        skills: parseSkills(skills),
        linkedin_url: linkedin_url || null,
        resume_path: resumePath,
        resume_url: signedResumeUrl
      }, { onConflict: "id" });

    if (profileInsert.error) {
      throw new Error(profileInsert.error.message);
    }

    return res.status(201).json({
      message: "Registration completed successfully.",
      user: {
        id: createdUserId,
        email: normalEmail,
        role: "candidate"
      }
    });
  } catch (error) {
    if (createdUserId) {
      try {
        await serviceClient.auth.admin.deleteUser(createdUserId);
      } catch (cleanupError) {
        console.error("Unable to rollback failed registration user:", cleanupError.message);
      }
    }
    return res.status(500).json({ message: error.message || "Registration failed." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { role, identifier, password } = req.body || {};
    const normalRole = normalizeRole(role);
    const loginId = String(identifier || "").trim();

    if (!normalRole || !loginId || !password) {
      return res.status(400).json({ message: "Role, login ID, and password are required." });
    }

    if (!ALLOWED_ROLES.has(normalRole)) {
      return res.status(400).json({ message: "Invalid login role." });
    }

    if (
      normalRole === "hr_admin" &&
      config.adminLoginId &&
      config.adminLoginPassword &&
      loginId === config.adminLoginId &&
      password === config.adminLoginPassword
    ) {
      const token = makeToken({
        sub: "local-admin",
        role: "hr_admin",
        email: loginId,
        localAdmin: true
      });
      return res.json({
        message: "Admin login successful.",
        token,
        user: {
          id: "local-admin",
          email: loginId,
          full_name: "Admin",
          role: "hr_admin"
        }
      });
    }

    const signIn = await authClient.auth.signInWithPassword({
      email: loginId.toLowerCase(),
      password
    });

    if (signIn.error || !signIn.data.user) {
      return res.status(401).json({ message: signIn.error?.message || "Invalid login credentials." });
    }

    const profileResult = await serviceClient
      .from("profiles")
      .select("id, full_name, email, phone, role")
      .eq("id", signIn.data.user.id)
      .maybeSingle();

    if (profileResult.error) {
      return res.status(500).json({ message: profileResult.error.message });
    }

    const profileRole = profileResult.data?.role || "candidate";
    if (normalRole === "hr_admin" && profileRole !== "hr_admin") {
      return res.status(403).json({ message: "This account is not configured as admin." });
    }
    if (normalRole === "candidate" && profileRole === "hr_admin") {
      return res.status(403).json({ message: "This account is admin. Use admin login option." });
    }

    const token = makeToken({
      sub: signIn.data.user.id,
      role: profileRole,
      email: signIn.data.user.email
    });

    return res.json({
      message: "Login successful.",
      token,
      user: {
        id: signIn.data.user.id,
        email: profileResult.data?.email || signIn.data.user.email,
        full_name: profileResult.data?.full_name || "",
        role: profileRole
      }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Login failed." });
  }
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  try {
    if (req.auth.localAdmin) {
      return res.json({
        user: {
          id: "local-admin",
          email: req.auth.email || "",
          full_name: "Admin",
          role: "hr_admin"
        }
      });
    }

    const profileResult = await serviceClient
      .from("profiles")
      .select("id, full_name, email, phone, role, dob, gender, address, qualification, experience_years, current_title, skills, linkedin_url, resume_path, resume_url, created_at")
      .eq("id", req.auth.sub)
      .maybeSingle();

    if (profileResult.error) {
      return res.status(500).json({ message: profileResult.error.message });
    }

    if (!profileResult.data) {
      return res.status(404).json({ message: "Profile not found." });
    }

    const signedResume = await createResumeSignedUrl(profileResult.data.resume_path);
    return res.json({
      user: {
        ...profileResult.data,
        resume_url: signedResume || profileResult.data.resume_url || null
      }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Unable to fetch profile." });
  }
});

app.get("/api/jobs", async (req, res) => {
  try {
    const includeInactive = req.query.all === "1";
    if (includeInactive) {
      const viewer = getOptionalAuthPayload(req);
      if (!viewer || viewer.role !== "hr_admin") {
        return res.status(403).json({ message: "Admin access required for inactive jobs." });
      }
    }

    let query = serviceClient
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false });

    if (!includeInactive) {
      query = query.eq("is_active", true);
    }

    const jobsResult = await query;
    if (jobsResult.error) {
      return res.status(500).json({ message: jobsResult.error.message });
    }

    return res.json({
      jobs: (jobsResult.data || []).map((job) => ({
        ...job,
        company_name: getJobCompany(job)
      }))
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Unable to fetch jobs." });
  }
});

app.get("/api/jobs/:id", async (req, res) => {
  try {
    const includeInactive = req.query.all === "1";
    if (includeInactive) {
      const viewer = getOptionalAuthPayload(req);
      if (!viewer || viewer.role !== "hr_admin") {
        return res.status(403).json({ message: "Admin access required for inactive jobs." });
      }
    }

    const jobResult = await serviceClient
      .from("jobs")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();

    if (jobResult.error) {
      return res.status(500).json({ message: jobResult.error.message });
    }
    if (!jobResult.data) {
      return res.status(404).json({ message: "Job not found." });
    }
    if (!includeInactive && !jobResult.data.is_active) {
      return res.status(404).json({ message: "Job is not active." });
    }

    return res.json({
      job: {
        ...jobResult.data,
        company_name: getJobCompany(jobResult.data)
      }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Unable to fetch job detail." });
  }
});

app.post("/api/jobs", requireAuth, requireRole("hr_admin"), async (req, res) => {
  try {
    const {
      title,
      description,
      department,
      location,
      job_type,
      salary_range,
      skills_required,
      perks,
      company_name
    } = req.body || {};

    if (!title || !location) {
      return res.status(400).json({ message: "Title and location are required." });
    }

    const insertResult = await serviceClient
      .from("jobs")
      .insert({
        title: String(title).trim(),
        description: description || null,
        department: department || null,
        location: String(location).trim(),
        job_type: job_type || "full_time",
        salary_range: salary_range || null,
        skills_required: parseSkills(skills_required),
        perks: perks || null,
        company_name: company_name || "Raicam Industries",
        is_active: true
      })
      .select("*")
      .single();

    if (insertResult.error) {
      return res.status(500).json({ message: insertResult.error.message });
    }

    return res.status(201).json({ message: "Job created.", job: insertResult.data });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Unable to create job." });
  }
});

app.post("/api/applications", requireAuth, requireRole("candidate"), async (req, res) => {
  try {
    const {
      job_id,
      full_name,
      phone,
      dob,
      gender,
      address,
      qualification,
      experience_years,
      current_title,
      skills,
      cover_letter,
      linkedin_url
    } = req.body || {};

    if (!job_id) {
      return res.status(400).json({ message: "Job ID is required." });
    }

    const profileResult = await serviceClient
      .from("profiles")
      .select("*")
      .eq("id", req.auth.sub)
      .maybeSingle();

    if (profileResult.error) {
      return res.status(500).json({ message: profileResult.error.message });
    }
    if (!profileResult.data) {
      return res.status(404).json({ message: "Candidate profile not found." });
    }

    const jobResult = await serviceClient
      .from("jobs")
      .select("id, is_active")
      .eq("id", job_id)
      .maybeSingle();

    if (jobResult.error) {
      return res.status(500).json({ message: jobResult.error.message });
    }
    if (!jobResult.data || !jobResult.data.is_active) {
      return res.status(404).json({ message: "Selected job is not available." });
    }

    const existingResult = await serviceClient
      .from("applications")
      .select("id")
      .eq("candidate_id", req.auth.sub)
      .eq("job_id", job_id)
      .maybeSingle();

    if (existingResult.error && existingResult.error.code !== "PGRST116") {
      return res.status(500).json({ message: existingResult.error.message });
    }
    if (existingResult.data) {
      return res.status(409).json({ message: "You have already applied for this job." });
    }

    const profilePatch = {};
    if (full_name) profilePatch.full_name = String(full_name).trim();
    if (phone) profilePatch.phone = String(phone).trim();
    if (dob) profilePatch.dob = dob;
    if (gender) {
      const normalizedGender = parseGender(gender);
      if (!normalizedGender) {
        return res.status(400).json({ message: "Gender must be male, female, or other." });
      }
      profilePatch.gender = normalizedGender;
    }
    if (address) profilePatch.address = String(address).trim();
    if (qualification) profilePatch.qualification = String(qualification).trim();
    if (experience_years !== undefined && experience_years !== null && experience_years !== "") {
      const numberValue = parseNumber(experience_years);
      if (numberValue === null) {
        return res.status(400).json({ message: "Experience years must be a valid number." });
      }
      profilePatch.experience_years = numberValue;
    }
    if (current_title) profilePatch.current_title = String(current_title).trim();
    if (skills) profilePatch.skills = parseSkills(skills);
    if (linkedin_url) profilePatch.linkedin_url = String(linkedin_url).trim();

    let mergedProfile = profileResult.data;
    if (Object.keys(profilePatch).length > 0) {
      const updateResult = await serviceClient
        .from("profiles")
        .update(profilePatch)
        .eq("id", req.auth.sub)
        .select("*")
        .single();

      if (updateResult.error) {
        return res.status(500).json({ message: updateResult.error.message });
      }
      mergedProfile = updateResult.data;
    }

    const parsedSkills = parseSkills(skills);
    const finalSkills = parsedSkills.length > 0 ? parsedSkills : parseSkills(mergedProfile.skills);
    const parsedExperience = parseNumber(experience_years);
    const finalExperience = parsedExperience !== null ? parsedExperience : parseNumber(mergedProfile.experience_years);

    const insertResult = await serviceClient
      .from("applications")
      .insert({
        candidate_id: req.auth.sub,
        job_id,
        dob: mergedProfile.dob || null,
        gender: parseGender(mergedProfile.gender) || null,
        address: mergedProfile.address || null,
        qualification: mergedProfile.qualification || null,
        experience_years: finalExperience,
        current_title: current_title || mergedProfile.current_title || null,
        skills: finalSkills,
        resume_url: mergedProfile.resume_url || null,
        cover_letter: cover_letter || null,
        linkedin_url: linkedin_url || mergedProfile.linkedin_url || null,
        status: "under_review"
      })
      .select("id, status, created_at")
      .single();

    if (insertResult.error) {
      return res.status(500).json({ message: insertResult.error.message });
    }

    return res.status(201).json({
      message: "Application submitted successfully.",
      application: insertResult.data
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Unable to submit application." });
  }
});

app.get("/api/applications/my", requireAuth, requireRole("candidate"), async (req, res) => {
  try {
    const result = await serviceClient
      .from("applications")
      .select("id, status, created_at, job_id, jobs(id, title, company_name, location, job_type, salary_range)")
      .eq("candidate_id", req.auth.sub)
      .order("created_at", { ascending: false });

    if (result.error) {
      return res.status(500).json({ message: result.error.message });
    }

    return res.json({ applications: result.data || [] });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Unable to fetch your applications." });
  }
});

app.get("/api/admin/applications", requireAuth, requireRole("hr_admin"), async (req, res) => {
  try {
    const result = await serviceClient
      .from("applications")
      .select("id, status, created_at, candidate_id, job_id, profiles(full_name, phone, email, resume_url, resume_path, qualification, experience_years), jobs(id, title, company_name, location, job_type)")
      .order("created_at", { ascending: false });

    if (result.error) {
      return res.status(500).json({ message: result.error.message });
    }

    const mapped = await Promise.all((result.data || []).map(async (item) => {
      const profile = firstRelationObject(item.profiles);
      const job = firstRelationObject(item.jobs);

      let resumeUrl = profile?.resume_url || null;
      if (profile?.resume_path) {
        const signedResume = await createResumeSignedUrl(profile.resume_path);
        if (signedResume) resumeUrl = signedResume;
      }

      return {
        ...item,
        profiles: profile ? {
          ...profile,
          resume_url: resumeUrl
        } : null,
        jobs: job || null
      };
    }));

    return res.json({ applications: mapped });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Unable to fetch admin applications." });
  }
});

app.patch("/api/admin/applications/:id/status", requireAuth, requireRole("hr_admin"), async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!ALLOWED_APPLICATION_STATUSES.has(status)) {
      return res.status(400).json({ message: "Invalid application status." });
    }

    const result = await serviceClient
      .from("applications")
      .update({ status })
      .eq("id", req.params.id)
      .select("id, status")
      .single();

    if (result.error) {
      return res.status(500).json({ message: result.error.message });
    }

    return res.json({
      message: "Application status updated.",
      application: result.data
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Unable to update application status." });
  }
});

app.use((req, res) => {
  res.status(404).json({ message: "Route not found." });
});

app.listen(config.port, () => {
  console.log(`HR portal backend running on http://localhost:${config.port}`);
});
