-- Add explicit platform curriculum identifier columns
alter table if exists dispatch_log
  add column if not exists platform_curriculum_id text;

alter table if exists performances
  add column if not exists platform_curriculum_id text;

