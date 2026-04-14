# Cloudflare Pages Template

This folder contains minimal templates for hosting only the frontend on Cloudflare Pages.

## Build settings

- Framework preset: `Vite`
- Root directory: `frontend`
- Build command: `npm ci && npm run build`
- Build output directory: `dist`

## Required environment variables (Pages UI)

- `VITE_APP_ENV=production`
- `VITE_API_BASE_URL=https://<public-backend-domain>`

Do not place secrets in `VITE_*` variables.

