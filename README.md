# HR Portal (User + Admin)

This project now has:
- Frontend pages for user/admin with separate flows.
- Express backend APIs for auth, jobs, applications, and admin actions.
- Supabase schema scripts for required tables and resume storage.

## 1) Quick Start (No Supabase Needed)

Backend now supports **LOCAL MODE** automatically when Supabase keys are not set.

1. Go to `server/`
2. Run:
   - `npm install`
   - `npm start`
3. Serve frontend root (Live Server or any static server).
4. Login as Admin with:
   - ID: `admin`
   - Password: `admin123`

### Deployed on Vercel

This repo now includes `api/[...all].js`, so backend routes are available on the same domain:
- Frontend: `https://your-site.vercel.app`
- Backend API: `https://your-site.vercel.app/api/...`

If you changed API behavior recently, redeploy and hard-refresh browser once.

## 2) Supabase Setup (Optional Production Mode)

Run these SQL files in Supabase SQL Editor:
- `supabase-setup.sql` (base schema)
- `server/supabase-backend-upgrade.sql` (safe upgrades/indexes)

## 3) Backend Setup

1. Go to `server/`
2. Copy `.env.example` to `.env`
3. For local mode, keep Supabase keys empty and set:
   - `JWT_SECRET`
   - `FRONTEND_ORIGIN`
   - `ADMIN_LOGIN_ID`
   - `ADMIN_LOGIN_PASSWORD`
4. For Supabase mode, also fill:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY`
5. Install and run:
   - `npm install`
   - `npm start`

Backend runs by default on: `http://localhost:4000`

## 4) Frontend Setup

1. Keep `api-config.js` base URL aligned with backend:
   - `window.HR_API_CONFIG.baseUrl = "http://localhost:4000"`
2. Serve project root with any static server (for example Live Server).

## 5) Role Flows

- **User (Candidate)**:
  - Register with full details + resume.
  - Login as `User (Candidate)`.
  - View jobs, apply, and track status in candidate dashboard.

- **Admin**:
  - Login as `Admin` using direct admin ID/password from `.env`.
  - View applicants, open resumes, update status, and create jobs.

## 6) If You See "Failed to fetch"

1. Make sure backend is running on `http://localhost:4000`.
2. Ensure `server/.env` exists (Supabase keys can stay blank for local mode).
3. Keep `api-config.js` `baseUrl` same as backend URL.
4. For local development, keep `FRONTEND_ORIGIN=*` in `server/.env`.
