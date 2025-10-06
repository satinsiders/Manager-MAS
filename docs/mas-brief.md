# SuperfastSAT Multi-Agent System Brief

## 0. Mission
Provide fully personalized SAT prep.

- Send the most appropriate curriculum units every day.
- Record and visualize learning results in real time.
- Automatically update the studyplan every week.

All processes are driven by an LLM-based multi-agent system with observability and version control.

Note on terms: “Curriculum” refers to the platform-owned scaffolding of lessons and units (immutable; dispatched in minute bundles such as “Information and Ideas > Inferences > Guidance”). “Study Plan” refers to the MAS-owned, student-specific strategy that sequences curricula and pacing rules; agents consult the study plan to decide what curriculum minutes to send each day.

## 0.1 Conversational Front End (MVP)
- `apps/chat` orchestrates GPT-5 via the Responses API and now acts as the primary teacher interface; `apps/chat-ui` renders the streaming chat experience.
- Platform APIs are accessed exclusively through the `platform_api_call` tool. The UI shows progress and success/failure, while detailed payloads stay inside the model’s working memory.
- This console becomes the launch point for MAS actions (curriculum lookups, dispatches, plan updates) throughout the MVP.
- Run `npx tsx scripts/chat-dev-server.ts` to serve both the UI and API locally for QA and demos.

## 1. Content Hierarchy & Delivery Flow

- All curricula live in the SuperfastSAT CMS, which syncs with the LMS.
- A curriculum contains multiple units (questions).
- Each unit is tagged with the expected number of minutes needed to solve it.
- When curricula are assigned to students, they remain hidden until content is explicitly **sent** on the LMS.
- From the student's profile, the teacher can browse all available curricula, assign them, and dispatch units within the selected curriculum in minute-based volumes. Sending 10 minutes delivers enough units to total that time (e.g., ten 1‑minute questions). Curriculum titles reflect the question type (e.g., `[information and ideas] > Inferences`).
- Manager MAS will use 커리큘럼 목록 조회 (`GET /curriculums`) and 학생 커리큘럼 수강권 지급 (`POST /courses`) to replicate that assignment flow programmatically once the dispatcher is rebuilt.
- After reviewing average correctness and confidence ratings, the teacher decides whether to keep sending units from the current curriculum or assign a new one. When a student demonstrates mastery in a question type—often 100% correctness across sufficient practice—the teacher advances to a different question type.

## 2. Agents & One-Sentence Contracts

Active endpoints today:

| Agent | Trigger | Responsibility |
|-------|---------|----------------|
| Chat Console | Teacher prompt via chat UI | Stream GPT-5 responses, invoke `platform_api_call`, and surface Supabase/Platform context in plain language. |
| Platform Sync | Manual webhook or scheduled job | Mirror platform dispatch lists and daily performance summaries into Supabase mirrors. |
| Performance Recorder | Upon score arrival | Append `{student_id, study_plan_id, score, confidence_rating}` to the `performances` table. |
| Assessments | Diagnostic or full-length score upload | Normalize section scores, estimate a composite, and persist the record. |
| Admin Audit | On-demand report | Return recent decision/action history plus optional dispatch snapshots for a student.

Planned rebuilds (removed from the current codebase but kept in documentation for future work):

| Agent | Status | Responsibility |
|-------|--------|----------------|
| Orchestrator | To be rebuilt | Coordinate multi-step automations driven by the chat agent. |
| Dispatcher | To be rebuilt | Send curriculum minutes to the platform and log delivery results. |
| Lesson Picker | To be rebuilt | Recommend the next curriculum bundle + minutes based on recent performance. |
| Data Aggregator | To be rebuilt | Produce weekly summaries and charts fed to the chat agent. |
| Study Plan Editor | To be rebuilt | Draft new study plans using LLM guidance and latest performance. |
| QA & Formatter | To be rebuilt | Validate and promote study plan drafts. |

📊 The "weekly performance chart" utility remains in the repository history and will be reintroduced alongside the Data Aggregator rebuild.

## 3. Standard Data Schema (Supabase PostgreSQL)

| Table | Key Fields | Purpose |
|-------|------------|---------|
| `students` | `id, platform_student_id, name, timezone, current_studyplan_version, preferred_topics, days_to_exam` | Canonical roster + personalization state |
| `performances` | `id, student_id, study_plan_version_id, score, confidence_rating, captured_at, source` | Source data for learning results |
| `assignments` | `id, student_id, study_plan_version_id, questions_json, generated_by, duration_minutes, status` | Supplemental problem sets or guidance bundles |
| `studyplan_drafts` | `version, student_id, studyplan_json, rationale, created_by` | Proposed studyplans awaiting QA |
| `studyplan_versions` | `version, student_id, studyplan_json, policy_version, effective_at, superseded_at` | Immutable history powering audits |
| `studyplans` | `id, student_id, current_version_id, status, constraints_json` | Pointer to the active plan orchestrated by MAS |
| `studyplan_progress` | `id, student_id, question_type_id, mastery_state, evidence_window_json, last_decided_at` | Rolling mastery tracking per question type |
| `dispatch_mirror` | `student_id, platform_curriculum_id, student_curriculum_id, total_duration, remaining_duration, first_dispatched_at, last_dispatched_at` | Mirror of platform assignments for eligibility checks |
| `daily_performance_mirror` | `student_id, scheduled_date, platform_curriculum_id, stats_json, ingestion_timestamp` | Lesson/unit performance per dispatched bundle |
| `dispatch_log` | `id, student_id, platform_curriculum_id, study_plan_version_id, sent_at, channel, status, payload` | MAS Action Execution Log (platform API attempts + fingerprints) |
| `decision_log` | `id, student_id, study_plan_version_id, question_type_id, decision_type, policy_version, inputs_snapshot, expected_outcome, decided_at` | MAS reasoning trace & audit trail |
| `assessment_records` | `id, student_id, platform_curriculum_id, assessment_type, section_scores, composite_estimate, confidence, rationale` | Diagnostic & full-length exam results feeding plan revisions |

Immutable rules: `performances`, `assignments`, and past studyplans can only be appended. Only `students.current_studyplan_version` may be modified.

Beyond platform data, the system separately records:

- The studyplan and its version history for each student.
- Progress within the plan, tracking mastered question types.
- Per-question-type dispatch logs and daily performance summaries.
- Approximate scores for diagnostic tests and full-length exams.

## 4. Memory Hierarchy (LangGraph variant)

| Level | Storage Location | TTL/Version | Used By |
|-------|------------------|-------------|---------|
| Working Memory | Vercel function process object | Minutes to hours | Chat console request lifecycle |
| Short-Term Memory | Supabase tables `draft_cache`, `student_recent_scores` | Configurable (`DRAFT_TTL`, score TTL) | Reserved for future orchestration components |
| Long-Term Memory | Supabase (PostgreSQL) | Permanent, versioned | Chat console & data ingestion services |
| External Evidence | Supabase Storage (or AWS S3), Notion | Permanent | Audit/reporting workflows |

Accuracy priority: External evidence > Long-term > Short-term > Working.

`packages/shared/memory.ts` provides `writeDraft` and `readDraft` helpers for the `draft:*`
namespace. These keys automatically expire after a configurable TTL (default 1 hour via
`DRAFT_TTL`), making them suitable for cross-step context that should disappear after the
run completes.

## 5. Data Access Matrix

| Agent | READS | WRITES |
|-------|-------|--------|
| Chat Console | Supabase mirrors (`students`, `dispatch_mirror`, `daily_performance_mirror`) and platform APIs | Platform APIs only |
| Platform Sync | `students`, platform dispatch/performance endpoints | `platform_dispatches`, `dispatch_log`, `daily_performance_mirror`, `curriculum_catalog`, roster mirrors |
| Performance Recorder | – | `performances`, `student_recent_scores` |
| Assessments | – | `assessments` |
| Admin Audit | `mas_decisions`, `mas_actions`, `dispatch_log` | – |

## 6. Infrastructure Stack (Blueprint 1)

| Area | Tools |
|------|-------|
| Relational DB | Supabase (PostgreSQL + RLS + pgvector) |
| Object Storage | Supabase Storage (with optional AWS S3) |
| Cache/STM | Supabase (`draft_cache`, `student_recent_scores`) |
| Scheduling | External (GitHub Actions or Render jobs) — optional until orchestration returns |
| Runtime | Vercel Functions (Node/TS, OpenAI SDK) |
| Observability | GitHub Actions logs + Slack Webhook (Grafana optional) |

## 7. Four-Week Build Roadmap

Legacy roadmap for the automation rebuild:

| Week | Goal | Deliverables |
|------|------|--------------|
| Week 1 | Restore planning primitives | Re-introduce lesson picker scaffolding and reconnect recent-score context |
| Week 2 | Rebuild dispatch loop | Implement dispatcher + platform write path with Supabase mirrors |
| Week 3 | Resume weekly updates | Bring back data aggregator and study plan editor with QA hooks |
| Week 4 | Hardening | Add QA tooling, Slack notifications, and scale testing across >100 students |

## 8. Impact Points

- Clear role separation → easier debugging and scaling.
- Immutable, version-controlled data → track educational quality and compliance.
- Layered memory → enables both fast decision-making and data integrity.
- Easy to swap LLM modules → immediately reflect cost and performance optimizations.
- Human gate → only QA-approved studyplans are applied to students.
