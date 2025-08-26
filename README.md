# Manager-MAS

SuperfastSAT Multi-Agent System scaffold. This project uses the OpenAI Responses API and the OpenAI SDK.

## Structure

- `apps/` – Vercel serverless functions for each agent.
- `packages/` – shared libraries.
- `supabase/` – database migrations for PostgreSQL.
- `.github/workflows/` – scheduled GitHub Action workflows.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in credentials for Supabase, Upstash Redis, OpenAI and Slack.

3. Run type checks:

```bash
npm test
```

## Deployment

- Vercel deploys the functions under `apps/`.
- Supabase migrations can be executed with the Supabase CLI.
- GitHub Actions `daily-run.yml` and `weekly-run.yml` trigger orchestrator endpoints at 07:00 daily and 23:00 Friday respectively.

## Notes

Tables `lessons`, `performances`, `assignments` and historical `curricula` are append-only. `students.current_curriculum_version` is mutable.

## API

### Score Recorder

`POST /api/score-recorder`

Body parameters:

- `student_id` – UUID of the student
- `lesson_id` – UUID of the lesson
- `score` – numeric performance score
- `confidence_rating` – optional numeric rating representing the student's confidence
