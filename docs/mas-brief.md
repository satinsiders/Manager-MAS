# SuperfastSAT Multi-Agent System Brief

## 0. Mission
Provide fully personalized SAT prep.

- Send the most appropriate curriculum units every day.
- Record and visualize learning results in real time.
- Automatically update the studyplan every week.

All processes are driven by an LLM-based multi-agent system with observability and version control.

The system maintains a dedicated teacher account that is manually paired with each student on the SuperfastSAT platform. Once linked, the teacher account can interact with the student and manage curriculum delivery.

Note on terms: “Curriculum” refers to platform-owned content (immutable; dispatched in minutes). “Study Plan” refers to MAS-owned, versioned strategy artifacts (`study_plans`), created and revised based on performance.

## 1. Content Hierarchy & Delivery Flow

- All curricula live in the SuperfastSAT CMS, which syncs with the LMS.
- A curriculum contains multiple units (questions).
- Each unit is tagged with the expected number of minutes needed to solve it.
- When curricula are assigned to students, they remain hidden until content is explicitly **sent** on the LMS.
- From the student's profile, the teacher can browse all available curricula, assign them, and dispatch units within the selected curriculum in minute-based volumes. Sending 10 minutes delivers enough units to total that time (e.g., ten 1‑minute questions). Curriculum titles reflect the question type (e.g., `[information and ideas] > Inferences`).
- After reviewing average correctness and confidence ratings, the teacher decides whether to keep sending units from the current curriculum or assign a new one. When a student demonstrates mastery in a question type—often 100% correctness across sufficient practice—the teacher advances to a different question type.

## 2. Agents & One-Sentence Contracts

| Agent | Trigger | Responsibility |
|-------|---------|----------------|
| Scheduler | GitHub Actions cron | Call daily and weekly jobs at the exact time. |
| Orchestrator | All triggers | Pass context to required sub-agents and manage retries and logging. |
| Dispatcher | Immediately after selection | Send curriculum units and metadata to the SuperfastSAT platform and record in `dispatch_log`. |
| Performance Recorder | Upon score arrival | Append `{student_id, study_plan_id, score, confidence_rating}` to the `performances` table. |
| Data Aggregator | Fri 23:00 | Generate `performance_summary.json` by combining weekly performances and charts. |
| Studyplan Editor | After aggregation | Produce new `studyplan_v(X+1)` JSON. |
| QA & Formatter | Immediately after edit | Validate JSON schema/style and update student pointers to the new version. |
| Notification Bot | Success/failure hooks | Notify key events via Slack DM. |

📊 The "weekly performance chart" is generated automatically by a separate code module (not an agent) and referenced by the Data Aggregator.

## 3. Standard Data Schema (Supabase PostgreSQL)

| Table | Key Fields | Purpose |
|-------|------------|---------|
| `students` | `id, name, timezone, current_studyplan_version, preferred_topics` | Manage personalization status |
| `performances` | `id, student_id, study_plan_id, score, confidence_rating` | Source data for learning results |
| `studyplan_drafts` (`curricula_drafts`) | `version, student_id, studyplan_json` | Proposed studyplans awaiting QA |
| `studyplans` (`curricula`) | `version, student_id, studyplan_json, qa_user, approved_at` | Approved, version-controlled learning plan |
| `assignments` | `id, lesson_id, student_id, questions_json, generated_by, duration_minutes` | Supplementary problem sets |
| `dispatch_log` | `id, student_id, platform_curriculum_id, study_plan_id, sent_at, channel, status` | Operational visibility (platform + internal linkage) |

Immutable rules: `performances`, `assignments`, and past studyplans can only be appended. Only `students.current_studyplan_version` may be modified.

Beyond platform data, the system separately records:

- The studyplan and its version history for each student.
- Progress within the plan, tracking mastered question types.
- Per-question-type dispatch logs and daily performance summaries.
- Approximate scores for diagnostic tests and full-length exams.

## 4. Memory Hierarchy (LangGraph variant)

| Level | Storage Location | TTL/Version | Used By |
|-------|------------------|-------------|---------|
| Working Memory | Vercel function process object / Redis `draft:*` | Minutes to hours | Orchestrator & current chain |
| Short-Term Memory | Redis `last_3_scores:{id}` | ≤ 7 days | Dispatcher |
| Long-Term Memory | Supabase (PostgreSQL) | Permanent, versioned | All agents |
| External Evidence | Supabase Storage (or AWS S3), Notion | Permanent | QA & audit |

Accuracy priority: External evidence > Long-term > Short-term > Working.

`packages/shared/memory.ts` provides `writeDraft` and `readDraft` helpers for the `draft:*`
namespace. These keys automatically expire after a configurable TTL (default 1 hour via
`DRAFT_TTL`), making them suitable for cross-step context that should disappear after the
run completes.

## 5. Data Access Matrix

| Agent | READS | WRITES |
|-------|-------|--------|
| Dispatcher | `students`, `studyplans`, `dispatch_log` | `dispatch_log(status)` |
| Performance Recorder | – | `performances` |
| Data Aggregator | `performances`, `dispatch_log`, charts 📊 | Supabase Storage `performance_summary.json` |
| Studyplan Editor | `performance_summary` | `studyplan_drafts` |
| QA & Formatter | `studyplan_drafts` | `studyplans`, `students.current_studyplan_version` |
| Notification Bot | Event stream | Slack |

## 6. Infrastructure Stack (Blueprint 1)

| Area | Tools |
|------|-------|
| Relational DB | Supabase (PostgreSQL + RLS + pgvector) |
| Object Storage | Supabase Storage (with optional AWS S3) |
| Cache/STM | Upstash Redis |
| Scheduling | GitHub Actions cron |
| Runtime | Vercel Functions (Node/TS, OpenAI SDK) |
| Observability | GitHub Actions logs + Slack Webhook (Grafana optional) |

## 7. Four-Week Build Roadmap

| Week | Goal | Deliverables |
|------|------|--------------|
| Week 1 | MVP daily loop | Create tables & dispatcher → test with one student |
| Week 2 | Performance logging + supplements | Auto record scores, send problem sets to students |
| Week 3 | Weekly loop | Data aggregator & studyplan editor → produce v2 studyplan |
| Week 4 | Hardening | Slack notifications, optional Grafana dashboard, batch process >100 students |

## 8. Impact Points

- Clear role separation → easier debugging and scaling.
- Immutable, version-controlled data → track educational quality and compliance.
- Layered memory → enables both fast decision-making and data integrity.
- Easy to swap LLM modules → immediately reflect cost and performance optimizations.
- Human gate → only QA-approved studyplans are applied to students.
