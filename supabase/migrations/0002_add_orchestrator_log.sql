-- Orchestrator log table and active flag on students
create table if not exists orchestrator_log (
  id uuid primary key,
  run_type text,
  step text,
  success boolean,
  message text,
  run_at timestamptz default now()
);

alter table students add column if not exists active boolean default true;
