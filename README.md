# HR Portal (User + Admin)

This project now has:
- Frontend pages for user/admin with separate flows.
- Express backend APIs for auth, jobs, applications, and admin actions.
- Supabase schema scripts for required tables and resume storage.

## 1) Supabase Setup

Run these SQL files in Supabase SQL Editor:
- `supabase-setup.sql` (base schema)
- `server/supabase-backend-upgrade.sql` (safe upgrades/indexes)

## 2) Backend Setup

1. Go to `server/`
2. Copy `.env.example` to `.env`
3. Fill values:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY`
   - `JWT_SECRET`
   - `FRONTEND_ORIGIN`
   - `ADMIN_LOGIN_ID` and `ADMIN_LOGIN_PASSWORD` (for direct admin login)
4. Install and run:
   - `npm install`
   - `npm start`

Backend runs by default on: `http://localhost:4000`

## 3) Frontend Setup

1. Keep `api-config.js` base URL aligned with backend:
   - `window.HR_API_CONFIG.baseUrl = "http://localhost:4000"`
2. Serve project root with any static server (for example Live Server).

## 4) Role Flows

- **User (Candidate)**:
  - Register with full details + resume.
  - Login as `User (Candidate)`.
  - View jobs, apply, and track status in candidate dashboard.

- **Admin**:
  - Login as `Admin` using direct admin ID/password from `.env`.
  - View applicants, open resumes, update status, and create jobs.
