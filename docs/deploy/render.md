# Render Deployment

This guide walks through deploying the chat console (+ API) to Render as a Node web service.

## Prerequisites
- Render account with ability to create a Web Service
- GitHub repository containing this project (see `docs/deploy/github.md`)
- All required platform/API credentials (see `.env.example`)

## 1. Prepare your repository
1. Commit all local changes (Render deploys from Git).
2. Push the repo to GitHub so Render can pull from it.
3. Ensure the `render.yaml` file is present at the repo root (added in this prep) — Render will detect it automatically when creating a Blueprint deployment.

## 2. Create the service
1. Sign in to Render and choose **New > Blueprint**.
2. Select the GitHub repo and the default branch you want Render to deploy from.
3. Render will read `render.yaml` and propose a service named `manager-mas-chat`. Confirm or adjust the name/plan as needed.
4. Leave the environment type as **Node**. The blueprint sets the build command (`npm install --include=dev && npm run build`) and start command (`npm start`, which runs the compiled server from `dist/`).

## 3. Configure environment variables
Review `.env.example` and add the values Render should use:
- All Supabase credentials
- OpenAI key
- Platform URLs/secrets (`SUPERFASTSAT_*`, dispatcher URLs, etc.)
- MAS internal secrets (`ORCHESTRATOR_SECRET`, `SCHEDULER_SECRET`)

In Render:
1. For each variable listed in `render.yaml`, add a secret value (Render prompts for any `sync: false` entry).
2. Optionally set additional observability variables (e.g., `LOG_LEVEL`).

The blueprint pins `NODE_VERSION=20` and `NPM_CONFIG_PRODUCTION=false` so dev dependencies like `tsx` are installed during builds.

## 4. Kick off the first build
1. Click **Apply** to create the service.
2. Watch the deploy logs for:
   - Dependency install
   - `npm run build` (TypeScript compile)
   - `npm run chat:serve` starting on the port Render assigns (the server reads `PORT`).
3. When the service turns **Healthy**, open the public URL. You should see the MAS chat UI.

## 5. Post-deploy checklist
- Exercise the UI to verify streaming chat and operations.
- Confirm the background tool calls reach the platform and Supabase (check logs and platform dashboards).
- Set up Render alerts (e.g., on deploy failure) and schedule auto-deploys on every Git push.
- If you need staging + production, duplicate the service with different branches/secrets.

## Troubleshooting
- **Build fails with missing dev dependency**: make sure `NPM_CONFIG_PRODUCTION=false` remains set, or run `npm install --include=dev` locally and re-commit lockfiles.
- **Runtime errors about env vars**: confirm every key from `.env.example` has a Render secret value.
- **Long running requests**: increase the `plan` in `render.yaml` or adjust timeout settings in the Render dashboard.

## Next steps
- Wire Render deploys to GitHub Pull Request checks using Preview Environments.
- Configure a cron job (Render **Jobs**) if background agents need scheduled triggers beyond GitHub Actions.
