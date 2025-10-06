# Proactive AI Tutor Action Plan

## Phase 1 — Teacher Tooling Foundations

### Study Plan UX Enhancements
- **Context bundle in chat**: render current plan summary, mastery rollups, recent adjustments, and upcoming milestones alongside each student conversation.
- **Drafting workflow**: support structured edit proposals (objectives, pacing, curriculum swaps) with validation, change previews, and rationale capture before saving via `save_study_plan_draft`.
- **Publish checkpoints**: require confirmation prompts summarizing deltas, auto-log approver + timestamp, and push status updates to audit feeds.
- **Acceptance**: instructors can open a student chat and (a) view plan snapshots instantly, (b) propose edits without raw JSON, (c) publish updates with audit metadata, and (d) see success/failure feedback in-stream.

### Classroom Health Dashboard
- **Roster overview**: list active students with key metrics (study minutes in last 7 days, mastery trend, upcoming deadlines, missing check-ins).
- **Alerting widgets**: flag overdue assignments, stalled mastery, low confidence streaks, and expiring drafts.
- **Action shortcuts**: launch chat, schedule follow-ups, assign curricula, or approve drafts directly from cards.
- **Data integration**: uses Supabase mirrors (`dispatch_mirror`, `daily_performance`, `study_plan_progress`) plus platform sync timestamps.
- **Acceptance**: a teacher can spot risk signals within two clicks and trigger appropriate next actions without leaving the dashboard.

### Audit & Observability Upgrades
- **Unified activity log**: append every plan edit, platform dispatch, and communication with consistent schema (who, what, when, why, status).
- **Search & filters**: query by student, action type, time window, or outcome; export results for compliance.
- **Failure handling**: capture tool-call errors with remediation suggestions and escalation paths.
- **Notification hooks**: optional Slack/email alerts for high-severity failures or approvals pending >24h.
- **Acceptance**: stakeholders can reconstruct decision history end-to-end, identify gaps, and prove compliance during reviews.
- **Current status**: Supabase is now the source of truth for chat operations; when mirror data is missing the agent triggers a targeted refresh before responding, keeping platform calls incremental and idempotent.

### MVP Scope & Sequencing
1. Ship study plan context + draft/publish flow in chat (leveraging new Supabase helper module).
2. Deliver minimum viable dashboard with roster table, key metrics, and deep links to chat/drafts.
3. Layer in audit log API + UI, wiring existing tables (`mas_decisions`, `mas_actions`, `dispatch_log`) and new study-plan events.
4. Hardening sprint: polish error messaging, add tests, QA with pilot teachers.

### Next Iteration (in progress)
- **Async refresh UX**: promote data syncs out of the request cycle—queue background jobs, surface progress updates to the sidebar, and record per-student refresh stats.
- **Concurrent ingestion**: platform fetches now run with configurable concurrency; continue tuning limits and backoff so large rosters complete quickly without rate-limit collisions.
- **Plan editor ergonomics**: plain-text editing converts to structured plan JSON automatically; follow-on work will expose richer form controls for objectives, pacing, and curricula selection.

## Phase 2 Prep — Orchestration & Dispatcher Revival

### Key Services To Restore
- **Orchestrator** (`apps/orchestrator`): reintroduce scheduler, run graph, and context passing between agents.
- **Dispatcher** (`apps/dispatcher`): handle curriculum selection output, call platform APIs, ensure idempotency/logging.
- **Lesson Picker** (`apps/lesson-picker`): rebuild scoring pipeline, embeddings lookup, deterministic fallback.
- **Data Aggregator** (`apps/data-aggregator`): generate weekly analytics consumed by study plan editor.
- **Notification Bot / Scheduler**: resume automated reminders and timed jobs.

### Dependencies & Gaps
- **Codebase removals**: corresponding directories currently deleted; must restore from history or rebuild with modular interfaces.
- **Supabase schema**: migrations still reference mirrors/progress tables; verify constraints and indexes align with revived workloads.
- **Platform credentials flow**: ensure orchestrator has service auth (static token or delegated session refresh).
- **Queueing & retries**: decide on job runner (Cron, Render jobs, or external service) and implement exponential backoff with idempotent keys.
- **Testing harness**: need fixtures for platform API responses and Supabase interactions to prevent regression across agents.
- **Observability**: add structured logging, metrics (per student, per run), and alert thresholds before enabling automation.

### Open Questions
- What SLAs must orchestrated jobs meet (daily cutoffs, weekly report deadlines)?
- Do we need feature flags for per-student autonomy toggles during rollout?
- How will we simulate platform responses to validate planner/dispatcher logic before production reconnect?

## Evaluation & Safety Framework

### Multi-Layer Validation
- **Static checks**: schema validation for study plans, policy linting, and unit tests for decision heuristics.
- **Simulation harness**: nightly dry-runs against mirrored data; compare agent choices to teacher baselines and flag deviations.
- **Shadow mode**: run orchestrator/dispatcher in observe-only mode, logging proposed actions for review before activating writes.

### Human-in-the-Loop Controls
- **Approval queues**: configurable gates requiring teacher sign-off for high-impact actions (new curriculum assignments, large schedule changes).
- **Override tools**: rapid “pause automation” switch per student and global kill switch with immediate effect.
- **Escalation paths**: auto-alert staff when repeated failures or anomalies occur (e.g., three consecutive low-confidence sessions).

### Safety & Compliance
- **Content filters**: run generated messages through toxicity/off-policy classifiers before sending to students.
- **Privacy guardrails**: enforce data minimization in logs, redact identifiers in model prompts where possible, and honor retention policies.
- **Audit-ready logging**: link every autonomous action to rationale, source data, and model parameters used.

### Evaluation Cadence
- **Weekly reviews**: analyze key metrics (student engagement, accuracy of predictions, error rates) with cross-functional stakeholders.
- **Quarterly drills**: run red-team scenarios (prompt injection, platform outages, unexpected student responses) to test resilience.
- **Continuous monitoring**: alerting on latency spikes, cost anomalies, or LLM output distribution shifts.

---

Use this plan to guide backlog creation, assign owners, and align stakeholders as we transition from assisted teacher tooling to a proactive AI tutor.
