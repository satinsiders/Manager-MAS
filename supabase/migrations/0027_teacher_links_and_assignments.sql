-- Assignment schema alignment
alter table assignments
  add column if not exists study_plan_version_id int,
  add column if not exists platform_curriculum_id text,
  add column if not exists status text default 'draft',
  add column if not exists created_at timestamptz default now();

create index if not exists assignments_student_idx on assignments(student_id);
create index if not exists assignments_status_idx on assignments(status);
