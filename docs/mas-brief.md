# SuperfastSAT Multi-Agent System Brief

## 0. Mission
Provide fully personalized SAT prep.

- Send the most appropriate lesson every day.
- Record and visualize learning results in real time.
- Automatically update the curriculum every week.

All processes are driven by an LLM-based multi-agent system with observability and version control.

## 1. Content Hierarchy & Delivery Flow

- All lessons and curricula live in the SuperfastSAT CMS, which syncs with the LMS.
- A curriculum contains multiple lessons, each lesson contains multiple units (questions).
- Each unit is tagged with the expected number of minutes needed to solve it.
- When curricula are assigned to students, they remain hidden until content is explicitly **sent** on the LMS.
- From the LMS, the Manager MAS assigns the curriculum when necessary and dispatches units within the appropriate curriculum in minute-based volumes. Sending 10 minutes delivers enough units to total that time (e.g., ten 1‑minute questions).

## 2. Agents & One-Sentence Contracts

| Agent | Trigger | Responsibility |
|-------|---------|----------------|
| Scheduler | GitHub Actions cron | Call daily and weekly jobs at the exact time. |
| Orchestrator | All triggers | Pass context to required sub-agents and manage retries and logging. |
| Lesson Picker | 07:00 | Select `next_lesson_id` and supplementary problem set for each student using vector similarity and rule filters. |
| Dispatcher | Immediately after selection | Send lessons and metadata to the SuperfastSAT platform and record in `dispatch_log`. |
| Performance Recorder | Upon score arrival | Append `{student_id, lesson_id, score, confidence_rating}` to the `performances` table. |
| Data Aggregator | Fri 23:00 | Generate `performance_summary.json` by combining weekly performances and charts. |
| Curriculum Editor | After aggregation | Produce new `curriculum_v(X+1)` JSON. |
| QA & Formatter | Immediately after edit | Validate JSON schema/style and update student pointers to the new version. |
| Notification Bot | Success/failure hooks | Notify key events via Slack DM. |

📊 The "weekly performance chart" is generated automatically by a separate code module (not an agent) and referenced by the Data Aggregator.

## 3. Standard Data Schema (Supabase PostgreSQL)

| Table | Key Fields | Purpose |
|-------|------------|---------|
| `students` | `id, name, timezone, current_curriculum_version, last_lesson_sent, last_lesson_id, preferred_topics` | Manage personalization status |
| `lessons` | `id, topic, difficulty, asset_url, vector_embedding` | Fixed lesson catalog |
| `performances` | `id, student_id, lesson_id, score, confidence_rating` | Source data for learning results |
| `curricula` | `version, student_id, curriculum json, qa_user, approved_at` | Version-controlled learning plan |
| `assignments` | `id, lesson_id, student_id, questions_json, generated_by` | Supplementary problem sets |
| `dispatch_log` | `id, student_id, lesson_id, sent_at, channel, status` | Operational visibility |

Immutable rules: `lessons`, `performances`, `assignments`, and past `curricula` can only be appended. Only `students.current_curriculum_version` may be modified.

## 4. Memory Hierarchy (LangGraph variant)

| Level | Storage Location | TTL/Version | Used By |
|-------|------------------|-------------|---------|
| Working Memory | Vercel function process object / Redis `draft:*` | Minutes to hours | Orchestrator & current chain |
| Short-Term Memory | Redis `last_3_scores:{id}` | ≤ 7 days | Lesson Picker & Dispatcher |
| Long-Term Memory | Supabase (PostgreSQL) | Permanent, versioned | All agents |
| External Evidence | Supabase Storage (or AWS S3), Notion | Permanent | QA & audit |

Accuracy priority: External evidence > Long-term > Short-term > Working.

## 5. Data Access Matrix

| Agent | READS | WRITES |
|-------|-------|--------|
| Lesson Picker | `students`, recent `performances`, `curricula`, `lessons` | `dispatch_log` |
| Dispatcher | `students`, `lessons`, `dispatch_log` | `dispatch_log(status)` |
| Performance Recorder | – | `performances` |
| Data Aggregator | `performances`, charts 📊 | Supabase Storage `performance_summary.json` |
| Curriculum Editor | `performance_summary`, `lessons` | New `curricula` |
| QA & Formatter | New `curricula` | `students.current_curriculum_version` |
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
| Week 1 | MVP daily loop | Create tables, lesson picker & dispatcher → test with one student |
| Week 2 | Performance logging + supplements | Auto record scores, send problem sets to students |
| Week 3 | Weekly loop | Data aggregator & curriculum editor → produce v2 curriculum |
| Week 4 | Hardening | Slack notifications, optional Grafana dashboard, batch process >100 students |

## 8. Impact Points

- Clear role separation → easier debugging and scaling.
- Immutable, version-controlled data → track educational quality and compliance.
- Layered memory → enables both fast decision-making and data integrity.
- Easy to swap LLM modules → immediately reflect cost and performance optimizations.
- Human gate → only QA-approved curricula are applied to students.

