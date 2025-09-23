create extension if not exists pgcrypto;

create table if not exists daily_performance_units (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  scheduled_date date not null,
  platform_curriculum_id text not null,
  lesson_id text,
  unit_id text,
  unit_seq int,
  is_completed boolean,
  is_correct boolean,
  confidence numeric,
  consecutive_correct_count int,
  raw jsonb,
  ingested_at timestamptz default now(),
  unique (student_id, scheduled_date, platform_curriculum_id, lesson_id, unit_id, unit_seq)
);

alter table daily_performance_units enable row level security;
create policy select_daily_performance_units on daily_performance_units for select using (true);
create policy insert_daily_performance_units on daily_performance_units for insert with check (true);
create policy update_daily_performance_units on daily_performance_units for update using (true) with check (true);

create index if not exists daily_performance_units_student_date_idx
  on daily_performance_units(student_id, scheduled_date);
