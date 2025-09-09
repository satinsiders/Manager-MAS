-- Platform data mirrors for dispatch list (API 3) and daily performance (API 5)
create extension if not exists pgcrypto;

create table if not exists platform_dispatches (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete restrict,
  external_curriculum_id text not null,
  raw_title text,
  total_minutes int,
  remaining_minutes int,
  first_dispatched_at timestamptz,
  last_dispatched_at timestamptz,
  ingested_at timestamptz default now(),
  unique (student_id, external_curriculum_id)
);

alter table platform_dispatches enable row level security;
create policy select_platform_dispatches on platform_dispatches for select using (true);
create policy insert_platform_dispatches on platform_dispatches for insert with check (true);
create policy update_platform_dispatches on platform_dispatches for update using (true) with check (true);

create index if not exists platform_dispatches_student_idx on platform_dispatches(student_id);
create index if not exists platform_dispatches_curriculum_idx on platform_dispatches(external_curriculum_id);

create table if not exists daily_performance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete restrict,
  date date not null,
  external_curriculum_id text not null,
  bundle_ref text not null,
  avg_correctness numeric,
  avg_confidence numeric,
  units int,
  ingested_at timestamptz default now(),
  unique (student_id, date, external_curriculum_id, bundle_ref)
);

alter table daily_performance enable row level security;
create policy select_daily_performance on daily_performance for select using (true);
create policy insert_daily_performance on daily_performance for insert with check (true);
create policy update_daily_performance on daily_performance for update using (true) with check (true);

create index if not exists daily_performance_student_date_idx on daily_performance(student_id, date);

