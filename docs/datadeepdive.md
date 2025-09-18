## 1) Scope & Roles
- Platform (external system, via published APIs)
  - Source of truth for: curriculum assignment/dispatch and day-level learning results aggregated by the platform (lesson-level averages, units sent).
  - Actions: assign curriculum, dispatch minutes, list dispatched curricula, list students, return per-day learning stats.


- Supabase (your internal data store)
  - Source of truth for: study plan strategy, versions, mastery tracking by question type, decision logs, test/exam score estimation, and analytics snapshots mirrored from the platform.


- Manager MAS (decision engine)
  - Consumes both Platform data and Supabase state to (a) decide what to assign/dispatch next, (b) update the study plan and mastery status, (c) log decisions and outcomes.



## 2) Platform API Integration (what each API must deliver / how MAS uses it)
### Currently available (per latest teacher API guide)
#### 커리큘럼 목록 조회 — `GET /curriculums`
**Purpose:** fetch the catalog of assignable curricula for the teacher account.

**Key payload:** `id`, `originId`, `title`, `createdAt` (immutable curriculum metadata).

**MAS use:** refresh Supabase catalog mirrors, map platform curriculum IDs to taxonomy, and power search/selection before assignment.

#### 학생 커리큘럼 수강권 지급 — `POST /courses`
**Purpose:** grant a selected curriculum to a student, creating a `studentCurriculum` record.

**Request contract:** `{ curriculumId, studentId }` with 200 OK (no body) on success.

**MAS use:** orchestrated assignment flow calls this after planning chooses the next curriculum; log response status and verify via 학생 커리큘럼 목록 조회.

#### 학생 커리큘럼 목록 조회 — `GET /student-curriculums`
**Purpose:** enumerate every curriculum already linked to a student and expose its remaining workload.

**Key payload:** `remainingDuration`, `totalDuration`, `isStopped`, `lessonTotalCount`, and metadata (`title`, `curriculumId`, timestamps).

**MAS use:** confirm new assignments from 학생 커리큘럼 수강권 지급, drive eligibility checks before dispatching minutes, choose which curriculum still has inventory, and mirror assignment state into Supabase.

#### 학습분량 설정 — `POST /study-schedules/learning-volumes`
**Purpose:** dispatch additional minutes from a specific student-curriculum pair on a given date.

**Request contract:** `{ studentCurriculumId, scheduledDate (YYYY-MM-DD), duration (minutes) }` with 201 Created (no body) when successful.

**MAS use:** orchestrated dispatcher calls this endpoint after planning daily workload; response status is logged as the canonical proof of delivery.

#### 학생 목록 조회 — `GET /students`
**Purpose:** retrieve the roster of students tied to the teacher account, including validity flags.

**Key payload:** `id`, `studySchedule`, `isValid`, and `user` fields (`id`, `name`, `email`).

**MAS use:** maintain the student directory, confirm active matches before scheduling, and refresh Supabase mirrors of roster metadata.

#### 학습스케줄 목록 조회 — `GET /teacher/study-schedules`
**Purpose:** fetch the per-day schedule bundles alongside lesson/unit-level performance signals.

**Key payload:** top-level `studySchedule` (date/time window, total minutes, student info) and nested `studyLessons` → `studyUnits` with correctness and confidence values.

**MAS use:** derive daily performance summaries, update mastery trackers, and capture dispatch fingerprints (lesson/unit IDs) for idempotency.


## 3) Supabase Data Model (authoritative store for strategy, mastery, and auditing)
Below are entities and key attributes (described in plain English, not field names), plus relationships.
A. Student & Performance Core
Students


Own the canonical record per learner: Supabase `id`, platform student identifier, pairing metadata (match ID, teacher_id), name/email, timezone, exam target, and personalization preferences.


Track derived fields used for automation: `current_study_plan_id`, `current_study_plan_version`, `preferred_topics`, `days_to_exam`, and opt-in flags for human overrides.


Performance Ledger


Append-only log of daily/weekly performance snapshots from the platform or manual score entries (`student_id`, `study_plan_version_id`, score metrics, confidence rating, captured_at, source system).


Assignments


Records of supplemental problem sets or guidance packets produced by MAS (`id`, `student_id`, `study_plan_version_id`, `platform_curriculum_id`, `duration_minutes`, `questions_json`, `generated_by`, `status`).


Study Plan Drafts


Staging area for proposed study plan updates before QA approval (`student_id`, draft `version`, raw JSON payload, rationale, created_by, expires_at). Links forward to the immutable Study Plan Versions described below once approved.

Short-Term Automation State


`draft_cache` holds temporary orchestration context (keys prefixed with `draft:*`), including an `expires_at` timestamp so entries self-expire after the run. `student_recent_scores` stores the last three performance scores per student for quick lookups by the lesson picker.

B. Taxonomy & Catalog Mirrors
Question Type Taxonomy


Canonical hierarchy: domain → category → specific type (e.g., “Reading & Writing → Information & Ideas → Inferences”)


Human-readable path from the title



Curriculum Catalog Mirror (Optional but strongly recommended)


External curriculum identifier (from platform)


Raw title (as returned) mapping to Question Type Taxonomy


Curriculum subtype (e.g., guidance, practice (easy/medium/hard), diagnostic, full-length exam)

Ingestion: poll via 커리큘럼 목록 조회 and upsert by `id`; retain `originId` for joins back to the platform catalog.

Relationships: Each Catalog entry maps to exactly one Question Type in the taxonomy.

C. Study Planning & Mastery
Study Plan (current strategy per student)


Reference to Student


High-level objective (e.g., section targets, time budget per day)


Activation timestamp; “current” flag


Constraints (daily minutes target, pacing rules, etc.)


Decision policy version (so future policy changes don’t rewrite history)


Study Plan Version (immutable snapshots)


Reference to Study Plan


Full plan payload snapshot at the time of revision (prioritized question types, staged curriculum sequence, pacing)


Reason for revision (e.g., performance trend, days remaining, exam outcome)


Effective timestamp range (from X until superseded)


Study Plan Progress (per question type)


Reference to Study Plan (current version) and Question Type


Mastery status (e.g., not started, in progress, near mastery, mastered)


Evidence window definition (e.g., last N questions or last M lessons)


Current evidence metrics (rolling correctness, rolling confidence, sample sizes)


Last mastery decision timestamp


Relationships:
One Study Plan has many Versions.


One Study Plan has many Progress rows (one per active question type).


Progress entries reference the relevant Question Type.



D. Platform Data Mirrors (for decision support and analytics)
Dispatch Mirror (from 학생 커리큘럼 목록 조회)


Reference to Student and external curriculum identifier


Platform student-curriculum identifier (returned by 학생 커리큘럼 목록 조회)


Curriculum title (raw), parsed Question Type


Total workload, remaining workload


First/most recent dispatch timestamps


Derivable: cumulative minutes dispatched (if provided), bundles count


Daily Performance Mirror (from 학습스케줄 목록 조회)


Reference to Student and date


For each dispatched lesson/bundle that day:


Reference to external curriculum identifier and, if available, the bundle/lesson reference


Average correctness, average confidence, number of units included


Aggregated level per day to support trend queries


Relationships:
Dispatch Mirror links to Curriculum Catalog Mirror (by external curriculum identifier) and through it to Question Type; student_curriculum_id maintains uniqueness per learner assignment.


Daily Performance Mirror links to both Student and Curriculum (and to Taxonomy via Catalog).



E. Testing & Score Estimation (owned by Supabase)
Assessment Record (for diagnostic or full-length exams)


Reference to Student and external curriculum identifier


Assessment type (diagnostic vs. full-length)


Raw performance signals (per section: counts correct)


Approximate score estimate per section and composite (with method version)


Confidence of estimate and rationale summary (e.g., number of items, distribution)


Downstream effect on Study Plan Version (e.g., revision created due to underperformance in a type)


Relationships:
Assessment Record informs Study Plan Version updates; link each revision to the Assessment Record that justified it.



F. Decisioning, Actions, and Audit
MAS Decision Log


Reference to Student, Study Plan Version, and (optionally) targeted Question Type and Curriculum


Decision type (continue, remediate, switch curriculum, elevate difficulty, assign new, schedule assessment, pause, etc.)


Decision inputs snapshot (summaries from Daily Performance Mirror, Dispatch Mirror, Progress metrics, days-to-exam, constraints)


Expected outcome (e.g., “dispatch 20 minutes from guidance; aim for ≥80% correctness; reassess tomorrow”)


Policy version and thresholds used


Decision timestamp


MAS Action Execution Log


Link to the Decision Log entry


Action attempt status (success/failure), platform endpoint used (학습분량 설정 vs. 학생 커리큘럼 수강권 지급), timestamps


Returned identifiers (external curriculum identifier, studentCurriculumId, lesson/bundle reference); for 수강권 지급 log the requested `curriculumId` and the resulting `studentCurriculumId` observed via 학생 커리큘럼 목록 조회


Actual dispatched minutes (vs. planned)


Error details if any (rate limits, invalid state, exhausted workload)


Notifications & Teacher Review Hooks (optional)


Outbound messages created (e.g., “Assigned practice (hard) for Inferences; sent 15 minutes.”)


Acknowledge/override outcomes from a human teacher (to support a “human-in-the-loop” path)


Link back to Decision Log entries to compare human overrides vs. automated choice



## 4) Core Relationships (summary)
Student ↔ Teacher: many-to-one.


Student → Study Plan: one current, many historical.


Study Plan → Study Plan Version: one-to-many.


Study Plan → Progress (per Question Type): one-to-many.


Question Type Taxonomy ↔ Curriculum Catalog Mirror: one-to-many.


Student → Dispatch Mirror: one-to-many (per platform student-curriculum pair).


Student → Daily Performance Mirror: one-to-many (per day, per bundle).


Assessment Record → Study Plan Version: informs creation of new versions.


MAS Decision Log → MAS Action Execution Log: one-to-many (one decision can yield multiple platform calls).



## 5) Manager MAS Operational Flow
Daily cycle (per student)
Sync intake (call 커리큘럼 목록 조회 for catalog refresh when needed, plus 학생 커리큘럼 목록 조회, 학습스케줄 목록 조회, and 학생 목록 조회):


Pull dispatched curricula with total/remaining workload.


Pull yesterday’s (and recent window) lesson-level outcomes: average correctness, average confidence, units per lesson.


Refresh minimal student roster changes.


Update mirrors & rollups in Supabase:


Upsert into Dispatch Mirror (by external curriculum identifier).


Upsert into Daily Performance Mirror (per date, per bundle).


Update Study Plan Progress rollups (rolling correctness/confidence windows per Question Type).


Compute current status:


For each active Question Type, evaluate mastery rules (e.g., “100% correctness across at least N practice questions within last M days” → mark as mastered).


Check remaining workload on the current curriculum.


Consider constraints (daily minutes target, days to test, recent fatigue or low confidence).


Decide next action:


Continue current curriculum if correctness/confidence are adequate and workload remains.


Remediate (switch to guidance/easier practice) if low correctness or confidence.


Elevate difficulty if sustained high performance and near mastery.


Assign new curriculum (lookup via 커리큘럼 목록 조회, then call 학생 커리큘럼 수강권 지급) when switching track or exhausting remaining workload.


Dispatch minutes via 학습분량 설정 against the chosen curriculum, selecting a minute-bundle that fits the daily target.


Record decision and execution:


Write a MAS Decision Log with inputs, policy version, and expected outcome.


On platform success, write an Action Execution Log with identifiers (studentCurriculumId, date) and the minutes requested/dispatched.


Assessment handling (when applicable):


When the dispatched item is a diagnostic or full-length exam, on results availability, compute the approximate score and store in Assessment Record; link any plan revision to this record.



## 6) Mastery, Thresholds, and Evidence Windows (data, not code)
Mastery status per Question Type is not a single score but a state plus supporting evidence:


Rolling window selection: define the lookback length in days and a minimum sample size of practice questions.


Thresholds: sustained perfect (or near-perfect) correctness, with a supporting confidence average.


Decay: older evidence receives less weight; keep the last decision timestamp and the evidence window snapshot used.


Progression rules (examples to encode as data in the plan):


Entry stage: guidance → practice (easy) → practice (medium) → practice (hard).


Advancement trigger: meet threshold T for K consecutive lessons or Q total items within the evidence window.


Regression trigger: drop below threshold for Y consecutive lessons; confidence collapse despite reasonable correctness; time scarcity near the exam date.


All thresholds, minimum sample sizes, and lookback windows should be stored alongside the Study Plan Version and referenced by the MAS Decision Log so the exact policy used is auditable later.

## 7) API–Supabase Integration Patterns
Synchronization keys:


Always store the platform’s unique identifiers for student and curriculum; do not invent alternate keys.


Where the platform returns a lesson/bundle reference for a dispatch, store it to link performance later.


Taxonomy parsing:


Curriculum titles include hierarchical prefixes (e.g., “[information and ideas] > Inferences …”).


Maintain a stable mapping table so renames or formatting changes in titles can be reconciled to the same canonical Question Type.


Mirroring strategy:


Treat 커리큘럼 목록 조회, 학생 커리큘럼 목록 조회, and 학습스케줄 목록 조회 as sources of truth and mirror them with ingestion timestamps.


If records change retroactively (late aggregation corrections), allow upserts keyed by student, date, curriculum, and bundle reference.


Idempotency:


MAS Action Execution Log must store platform response fingerprints (e.g., dispatch timestamp + bundle reference) to prevent double-dispatch on retries.



## 8) Error Handling & Edge Cases
Exhausted workload: select the next curriculum via 커리큘럼 목록 조회 and assign it with 학생 커리큘럼 수강권 지급 before attempting another 학습분량 설정 call.


Missing performance data: If 학습스케줄 목록 조회 is delayed, MAS can use the latest available window; mark decision inputs as “partial.”


Conflicting assignments: If multiple curricula of the same Question Type are assigned, MAS prefers the one with the least remaining workload or the one aligned to the current stage (guidance → practice tier).


Rate limits or API failures:


Log a failed Action Execution entry with error details.


Retry with exponential backoff; never record a “success” without a valid platform acknowledgment.


Human overrides:


When a teacher adjusts the plan or minutes, write a human override entry that references the MAS Decision Log; keep both for post-hoc evaluation.



## 9) Security, Privacy, and Access
Store only minimal PII (name, email).


Use role-based access controls:


The Manager MAS needs read/write on study plan, progress, mirrors, decisions, actions, and assessments.


Human teachers need read access to decisions and progress; write access for overrides.


Consider row-level security to isolate students by teacher or tenant.



## 10) Analytics & Observability (derived from Supabase)
Per-student dashboard: minutes dispatched vs. target; mastery status by Question Type; approximate score trend; days to exam.


Cohort analytics: average time-to-mastery per Question Type; effect of guidance vs. practice tiers; confidence vs. correctness gaps.


MAS performance: decision distribution; success rate of planned vs. executed actions; re-dispatch due to errors; uplift after plan revisions.


Data quality: late or missing 학습스케줄 목록 조회 entries; taxonomy parsing mismatches; duplicate dispatches caught by idempotency.



## 11) Open Assumptions (flag for platform devs)
Platform guarantees unique, stable identifiers for students, curricula, and dispatched bundles/lessons.


학생 커리큘럼 목록 조회 always returns a stable `id` (studentCurriculumId) for use with 학습분량 설정.

학습분량 설정 currently acknowledges requests with 201 (no body); platform to confirm whether future responses will include actual dispatched minutes and bundle references.

학생 커리큘럼 수강권 지급 responds with 200 (no body); MAS confirms success via subsequent 학생 커리큘럼 목록 조회 sync.

학습스케줄 목록 조회 aggregates at the lesson/bundle granularity and per day; if intraday breakdown exists, MAS will still consume the day-level summary.


Diagnostic and full-length exam curricula are reliably distinguishable (either explicit type labels or unambiguous naming conventions).


The platform respects “hidden until sent” behavior for assigned curricula, and exposes current visibility.



## Quick Ownership Summary
### Handled by Platform APIs:
- Assign curriculum to student (via 학생 커리큘럼 수강권 지급).


- List available curricula for the teacher account.


- Dispatch content measured in minutes.


- Report dispatched curricula with total vs. remaining workload.


- List students.


- Report per-day lesson/bundle outcomes: average correctness, average confidence, units per lesson.


### Handled by Supabase (owned by you):
- Study plan (current) and full version history.


- Mastery tracking by Question Type with evidence windows.


- Mirrors of Platform progress (dispatch and daily performance) for decisioning and analytics.


- Assessment records with approximate score estimation.


- MAS decisions, action execution logs, notifications, and human overrides.


- Taxonomy mapping and curriculum catalog mirror for stable joins.


- Constraints, pacing targets, and policy versions for auditability.
