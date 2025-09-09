-- Assessments: diagnostic or full-length exams with approximate score estimation
create extension if not exists pgcrypto;

create table if not exists assessments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete restrict,
  external_curriculum_id text,
  type text not null, -- diagnostic | full-length
  raw_signals jsonb, -- per section counts, timings, etc.
  section_estimates jsonb, -- per section approximate scores
  composite_estimate numeric,
  method_version text,
  confidence numeric,
  rationale text,
  created_at timestamptz default now()
);

alter table assessments enable row level security;
create policy select_assessments on assessments for select using (true);
create policy insert_assessments on assessments for insert with check (true);
create policy update_assessments on assessments for update using (true) with check (true);

