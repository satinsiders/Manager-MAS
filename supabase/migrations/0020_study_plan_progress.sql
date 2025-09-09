-- Study plan progress storage and compatibility view
create extension if not exists pgcrypto;

create table if not exists study_plan_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete restrict,
  study_plan_id uuid not null references curricula(id) on delete restrict,
  question_type text not null,
  status text not null, -- not_started | in_progress | near_mastery | mastered
  evidence_window jsonb,
  rolling_metrics jsonb,
  last_decision_at timestamptz,
  created_at timestamptz default now()
);

alter table study_plan_progress enable row level security;
create policy select_study_plan_progress on study_plan_progress for select using (true);
create policy insert_study_plan_progress on study_plan_progress for insert with check (true);
create policy update_study_plan_progress on study_plan_progress for update using (true) with check (true);

create index if not exists spp_student_plan_type_idx on study_plan_progress(student_id, study_plan_id, question_type);

-- Compatibility view used by lesson-picker
create or replace view student_progress as
select
  spp.student_id,
  spp.question_type,
  (spp.status = 'mastered') as mastered
from study_plan_progress spp
join students s on s.id = spp.student_id
join curricula c on c.id = spp.study_plan_id and c.student_id = s.id and c.version = s.current_curriculum_version;

