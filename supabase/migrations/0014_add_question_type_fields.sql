-- Add question type and curriculum tracking
alter table dispatch_log
  add column if not exists question_type text,
  add column if not exists curriculum_id uuid;

alter table performances
  add column if not exists question_type text,
  add column if not exists curriculum_id uuid;
