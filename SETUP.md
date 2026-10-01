# Department of Physiology — Faculty Admin System

This version adds a faculty management system without Supabase.

## Vercel environment variables
Set these in Vercel Project Settings → Environment Variables:

- `GITHUB_TOKEN` — a GitHub fine-grained PAT with Contents: Read and write access to `DocMoon69/physiology-department`
- `GITHUB_REPO` — `DocMoon69/physiology-department`
- `GITHUB_BRANCH` — `main`
- `ADMIN_PASSWORD` — choose a strong admin password
- `SESSION_SECRET` — long random secret string

After setting variables, redeploy.

## Admin
Open `/admin.html`.

Public faculty cards are loaded from `/api/faculty`. Admin changes are committed to GitHub and Vercel redeploys from `main`.
