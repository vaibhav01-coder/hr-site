# HR Portal (Static Supabase Frontend)

This project runs as a fully static frontend connected directly to Supabase:
- Candidate registration/login with resume upload
- Public job browsing and apply flow
- Admin dashboard with real-time application updates

## 1) Supabase Setup

Run these SQL files in Supabase SQL Editor:
1. `supabase-setup.sql` for new projects
2. `supabase-static-upgrade.sql` for existing projects

## 2) Frontend Setup

1. Update `supabase-config.js`:
   - `window.HR_SUPABASE_CONFIG.url`
   - `window.HR_SUPABASE_CONFIG.anonKey`
2. Configure admin login mapping in `supabase-config.js`:
   - `window.HR_ADMIN_AUTH.loginId`
   - `window.HR_ADMIN_AUTH.email` (required if admin signs in with short ID like `admin`)
3. Serve this folder with any static server (Live Server, Vercel static, Netlify, etc.)

## 3) Role Flows

- Candidate:
  - Register with details + resume
  - Sign in with email/password
  - Apply for jobs and track status in dashboard

- Admin:
  - Sign in with admin credentials
  - View applications and resumes
  - Update application status and publish jobs
  - See new applications in real time

## 4) Notes

- The frontend no longer depends on `/api/*` backend routes.
- Sample/fake job seed inserts were removed from `supabase-setup.sql`.
- If your old database already has demo jobs, use the optional delete query in `supabase-static-upgrade.sql`.
