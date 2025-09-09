-- Introduce study plan naming while keeping backward-compat views
create or replace view study_plans as
  select
    id,
    version,
    student_id,
    curriculum as study_plan,
    qa_user,
    approved_at
  from curricula;

create or replace view study_plan_drafts as
  select
    student_id,
    version,
    curriculum as study_plan,
    created_at
  from curricula_drafts;

