# Database Policies

The database uses row level security (RLS) on all tables. Select access is allowed to all rows, while several tables are append-only:

- **lessons** – insert only, no updates or deletes.
- **performances** – insert only, no updates or deletes.
- **assignments** – insert only, no updates or deletes.
- **curricula** – versioned history, insert only.

Foreign key relations use `ON DELETE RESTRICT` to prevent accidental cascades. Triggers on the append-only tables raise exceptions if an update or delete is attempted.
