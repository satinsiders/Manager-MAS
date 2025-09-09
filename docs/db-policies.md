# Database Policies

The database uses row level security (RLS) on all tables. Select access is allowed to all rows, while several tables are append-only:

- **performances** – insert only, no updates or deletes.
- **assignments** – insert only, no updates or deletes.
- **studyplans (`curricula`)** – versioned history, insert only.
 - **studyplan_drafts (`curricula_drafts`)** – mutable staging table for proposed studyplans.

Foreign key relations use `ON DELETE RESTRICT` to prevent accidental cascades. Triggers on the append-only tables raise exceptions if an update or delete is attempted.

The `students` table stores core profile data (`id`, `name`, `timezone`, `current_curriculum_version` as the current study plan version) and user preferences. The `preferred_topics` **text[]** column records any topics a student wants to focus on and informs content selection while remaining mutable under RLS.

Additional append-only records support the official workflow:

- **dispatch_log** – operational visibility for sends, tied to `study_plan_id`; platform curriculum progress is mirrored in `platform_dispatches`.
- **performances** – captures daily correctness and confidence ratings, including approximate scores for tests and exams.
- **studyplans (`curricula`)** – stores the studyplan and its versions, allowing progress tracking as question types are mastered.
