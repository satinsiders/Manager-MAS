# Database Policies

The database uses row level security (RLS) on all tables. Select access is allowed to all rows, while several tables are append-only:

- **lessons** – insert only, no updates or deletes.
- **performances** – insert only, no updates or deletes.
- **assignments** – insert only, no updates or deletes.
- **curricula** – versioned history, insert only.
 - **curricula_drafts** – mutable staging table for proposed curricula.

Foreign key relations use `ON DELETE RESTRICT` to prevent accidental cascades. Triggers on the append-only tables raise exceptions if an update or delete is attempted.

The `students` table stores core profile data (`id`, `name`, `timezone`, `current_curriculum_version`, `last_lesson_sent`, `last_lesson_id`) and user preferences. The `last_lesson_sent` timestamp and `last_lesson_id` UUID track the most recent lesson delivered. The `preferred_topics` **text[]** column records any topics a student wants to focus on and informs the lesson picker while remaining mutable under RLS.
