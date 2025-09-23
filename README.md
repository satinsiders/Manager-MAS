# Manager-MAS

SuperfastSAT Multi-Agent System scaffold. This project uses the OpenAI Responses API and the OpenAI SDK.

## Official Description

The system calls the SuperfastSAT teacher APIs directly, browsing curricula, assigning content, and dispatching units measured in expected minutes to complete. After reviewing correctness and confidence ratings returned by the platform, MAS decides whether to continue the current curriculum or assign a new one. When a student demonstrates mastery in a question type—typically through perfect accuracy across sufficient practice—the automation progresses to a different question type.

To support this workflow, the system stores its own records for:

- The studyplan for each student and its version history.
- Progress through the plan, tracking which question types have been mastered.
- A dispatch log noting which curricula have been sent for each question type.
- Daily performance logs capturing correctness and confidence ratings.
- Approximate scores for diagnostic tests and full-length exams.

## Terminology

- Curriculum: immutable content catalog from the SuperfastSAT platform, dispatched in minute-based units via platform APIs. Sourced via platform APIs (assignment/dispatch lists and daily performance) and mirrored in our database.
- Study Plan: the internal, versioned strategy owned by this system (created, drafted, QA’d, and approved). Stored in `curricula` (exposed as the `study_plans` view).

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

2. Copy `.env.example` to `.env` and fill in credentials for Supabase, OpenAI, Slack, set `STUDYPLAN_EDITOR_URL`, `ORCHESTRATOR_URL`, and configure the platform base URL (`SUPERFASTSAT_API_URL`).
   - If the platform team provides a long-lived key, set `SUPERFASTSAT_API_TOKEN`.
   - Otherwise leave the token blank and provide the teacher login via `SUPERFASTSAT_TEACHER_EMAIL` and `SUPERFASTSAT_TEACHER_PASSWORD` to have MAS fetch a fresh key automatically (see `docs/apiguide.md`).
   - Configure `ASSIGNMENTS_URL` for the supplemental agent, plus secrets `ORCHESTRATOR_SECRET` and `SCHEDULER_SECRET`. Optionally adjust `DRAFT_TTL` (seconds for `draft:*` keys).

3. Run type checks:

```bash
npm test
```

## Deployment

- Vercel deploys the functions under `apps/`.
- Supabase migrations should be applied during deployment using the Supabase CLI, e.g. `supabase db push`. The latest migration adds `platform_student_id` to `students` and `student_curriculum_id` to the platform mirrors; populate these before switching traffic to minutes-based dispatching.
- GitHub Actions workflow `scheduler.yml` triggers the scheduler endpoint at 07:00 daily and 23:00 Friday, which in turn invokes the orchestrator with the appropriate `run_type`.

## Notes

Tables `performances`, `assignments`, and historical studyplans (`curricula`) are append-only. The `students.current_curriculum_version` column storing the active studyplan is mutable.

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
- `study_plan_id` – UUID of the study plan version (internal)
- `platform_curriculum_id` – external curriculum identifier (platform)
- `score` – numeric performance score
- `confidence_rating` – optional numeric rating representing the student's confidence
