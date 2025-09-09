-- Add study_plan_id columns and backfill from legacy curriculum_id
alter table if exists dispatch_log
  add column if not exists study_plan_id uuid;

alter table if exists performances
  add column if not exists study_plan_id uuid;

update dispatch_log set study_plan_id = curriculum_id where study_plan_id is null and curriculum_id is not null;
update performances set study_plan_id = curriculum_id where study_plan_id is null and curriculum_id is not null;

