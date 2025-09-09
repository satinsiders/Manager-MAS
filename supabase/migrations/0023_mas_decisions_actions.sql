-- MAS Decision Log and Action Execution Log
create extension if not exists pgcrypto;

create table if not exists mas_decisions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete restrict,
  study_plan_version int,
  question_type text,
  decision_type text not null, -- continue | remediate | switch | elevate | assign_new | dispatch_minutes | dispatch_units | schedule_assessment | pause
  inputs jsonb,
  expected_outcome jsonb,
  policy_version text,
  decided_at timestamptz default now()
);

alter table mas_decisions enable row level security;
create policy select_mas_decisions on mas_decisions for select using (true);
create policy insert_mas_decisions on mas_decisions for insert with check (true);

create table if not exists mas_actions (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid references mas_decisions(id) on delete set null,
  action_type text not null, -- assign_curriculum | dispatch_minutes | dispatch_units
  request jsonb,
  status text,
  response jsonb,
  platform_curriculum_id text,
  platform_bundle_ref text,
  requested_minutes int,
  actual_minutes int,
  dispatch_log_id uuid references dispatch_log(id) on delete set null,
  fingerprint text unique,
  attempted_at timestamptz default now()
);

alter table mas_actions enable row level security;
create policy select_mas_actions on mas_actions for select using (true);
create policy insert_mas_actions on mas_actions for insert with check (true);

