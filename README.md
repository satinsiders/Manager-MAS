# Manager-MAS

This repository implements a modular agent system using Vercel Functions, Supabase, Upstash Redis, and GitHub Actions.

## Structure

- `apps/api` – Vercel serverless functions for agents (`orchestrator`, `lesson-picker`, `dispatcher`, `score-webhook`).
- `packages` – Shared clients for Supabase, Upstash Redis, and OpenAI.
- `scripts` – Node scripts used by scheduled GitHub Actions.
- `supabase` – Database schema and migrations.
- `.github/workflows` – Daily and weekly scheduled workflows.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in the required secrets.
3. Run type checks and build:
   ```bash
   npm test
   npm run build
   ```
4. Start a local server (using `vercel dev` or any Node runner) to test API routes.

## Deployment

- Deploy the `apps/api` directory to Vercel.
- Apply database migrations with the Supabase CLI:
  ```bash
  supabase db push
  ```
- Configure environment variables in Vercel and GitHub repository secrets to match `.env.example`.
- GitHub Actions (`daily-run.yml` and `weekly-run.yml`) call the orchestrator and maintenance scripts on schedule.

## Testing

Run the included type check:
```bash
npm test
```
