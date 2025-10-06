# Manager-MAS

SuperfastSAT Multi-Agent System scaffold. This project uses the OpenAI Responses API and the OpenAI SDK.

## Official Description

The system calls the SuperfastSAT teacher APIs directly, browsing curricula, assigning content, and dispatching units measured in expected minutes to complete. After reviewing correctness and confidence ratings returned by the platform, MAS decides whether to continue the current curriculum or assign a new one. When a student demonstrates mastery in a question type—typically through perfect accuracy across sufficient practice—the automation progresses to a different question type.

For the MVP, every instructor interaction happens through the MAS chat console (`apps/chat` + `apps/chat-ui`). The front end streams Responses API tokens in real time while background tools call SuperfastSAT APIs without exposing raw payloads to the user.

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

- `apps/chat/` – streaming Responses API orchestrator (primary instructor interface).
- `apps/chat-ui/` – teacher-facing chat console that renders streaming output and tool progress.
- `apps/auth/` – session management endpoints for the chat console.
- `apps/admin-audit/`, `apps/assessments/`, `apps/performance-recorder/`, `apps/platform-sync/` – data ingestion and reporting endpoints that keep Supabase mirrors fresh.
- `scripts/chat-dev-server.ts` – local runner serving both the chat API and UI together.
- `packages/` – shared libraries.
- `supabase/` – database migrations for PostgreSQL.
- `.github/workflows/` – scheduled GitHub Action workflows.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and set the required secrets:
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY`
   - `NOTIFICATION_BOT_URL` for Slack/alert relay
   - `SUPERFASTSAT_API_URL` (and optionally `SUPERFASTSAT_API_TOKEN` if you have a static teacher key)
   - Adjust `DRAFT_TTL` if you want to change the temporary cache lifetime
   - If the platform team does not provide a long-lived token, leave `SUPERFASTSAT_API_TOKEN` blank. Instructors authenticate from chat with `login email@example.com password` before calling platform operations.

3. Run type checks:

```bash
npm test
```

### Chat Console (Local)

Launch the streaming chat experience locally with:

```bash
npm run chat:dev
```

This uses `tsx` for live TypeScript execution. For a production-style run, build first (`npm run build`) and then start the compiled server via `npm start`.

The server prints both the UI (`/api/chat-ui`) and API (`/api/chat`) URLs.

## Deployment

- The chat console + API can run anywhere Node 20 is available. Run `npm run build` followed by `npm start` (alias of `npm run chat:serve`) to serve the compiled output.
- Render blueprint (`render.yaml`) provisions a managed web service; follow `docs/deploy/render.md` for step-by-step deployment.
- Push the repo to GitHub and enable CI + branch protections using `docs/deploy/github.md`.
- Supabase migrations should be applied during deployment using the Supabase CLI, e.g. `supabase db push`. The latest migration adds `platform_student_id` to `students` and `student_curriculum_id` to the platform mirrors; populate these before switching traffic to minutes-based dispatching.

## Notes

Tables `performances`, `assignments`, and historical studyplans (`curricula`) are append-only. The `students.current_curriculum_version` column storing the active studyplan is mutable.

## API

### Performance Recorder

`POST /api/performance-recorder`

Body parameters:

- `student_id` – UUID of the student
- `study_plan_id` – UUID of the study plan version (internal)
- `platform_curriculum_id` – external curriculum identifier (platform)
- `score` – numeric performance score
- `confidence_rating` – optional numeric rating representing the student's confidence

### Platform Sync

`POST /api/platform-sync`

Body parameters (all optional):

- `dispatches` – array of platform dispatch rows to upsert into Supabase mirrors
- `daily_performance` – array of performance payloads mirroring the platform's study schedule summaries

If no body is provided, the endpoint will attempt to pull fresh data from the platform APIs for each active student using the configured Supabase roster.

### Assessments

`POST /api/assessments`

Body parameters:

- `student_id` – UUID of the student
- `type` – assessment flavor (`diagnostic` or `full-length`)
- `sections` – array of `{ section, correct, total }` objects to score and persist

The endpoint estimates per-section and composite scores, stores the assessment record, and returns the new record ID along with the composite score and confidence estimate.

### Admin Audit

`GET /api/admin-audit`

Query parameters:

- `student_id` – optional UUID to scope the results
- `since` / `until` – optional ISO timestamps to bound the time window
- `include_dispatch` – set to `true` to include dispatch log mirrors
- `limit` – optional result cap (default 200, maximum 1000)

The endpoint returns recent MAS decisions, related actions, and (optionally) dispatch log snapshots for quick review.
