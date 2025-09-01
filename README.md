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

2. Copy `.env.example` to `.env` and fill in credentials for Supabase, Upstash Redis (`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`), OpenAI, Slack, set `CURRICULUM_EDITOR_URL`, `ORCHESTRATOR_URL`, and secrets `ORCHESTRATOR_SECRET` and `SCHEDULER_SECRET`. Optionally adjust `DRAFT_TTL` (seconds for `draft:*` keys).

3. Run type checks:

```bash
npm test
```

## Deployment

- Vercel deploys the functions under `apps/`.
- Supabase migrations should be applied during deployment using the Supabase CLI, e.g. `supabase db push`.
- GitHub Actions workflow `scheduler.yml` triggers the scheduler endpoint at 07:00 daily and 23:00 Friday, which in turn invokes the orchestrator with the appropriate `run_type`.

## Notes

Tables `lessons`, `performances`, `assignments` and historical `curricula` are append-only. `students.current_curriculum_version` is mutable.

## API

### Scheduler

`POST /api/scheduler?run_type=daily|weekly`

Headers:

- `Authorization: Bearer <SCHEDULER_SECRET>`

Environment variables:

- `ORCHESTRATOR_URL` – URL of the orchestrator endpoint.
- `ORCHESTRATOR_SECRET` – secret used when calling the orchestrator.
- `SCHEDULER_SECRET` – secret required to invoke the scheduler endpoint.

### Performance Recorder

`POST /api/performance-recorder`

Body parameters:

- `student_id` – UUID of the student
- `lesson_id` – UUID of the lesson
- `score` – numeric performance score
- `confidence_rating` – optional numeric rating representing the student's confidence
