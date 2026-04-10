const dotenv = require("dotenv");

dotenv.config();

const supabaseRequired = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"];
const missingSupabase = supabaseRequired.filter((key) => !process.env[key]);

const frontendOriginEnv = process.env.FRONTEND_ORIGIN || "*";
const frontendOrigins = frontendOriginEnv
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const useLocalMode = missingSupabase.length > 0;
const defaultAdminLoginId = process.env.ADMIN_LOGIN_ID || "admin";
const defaultAdminLoginPassword = process.env.ADMIN_LOGIN_PASSWORD || "admin123";

if (useLocalMode) {
  console.warn(`[config] Supabase values missing (${missingSupabase.join(", ")}). Starting in LOCAL MODE.`);
}

module.exports = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || "local_dev_jwt_secret_change_me",
  frontendOrigin: frontendOriginEnv,
  frontendOrigins,
  allowAllOrigins: frontendOrigins.includes("*"),
  useLocalMode,
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
  resumesBucket: process.env.RESUMES_BUCKET || "resumes",
  adminLoginId: defaultAdminLoginId,
  adminLoginPassword: defaultAdminLoginPassword
};
