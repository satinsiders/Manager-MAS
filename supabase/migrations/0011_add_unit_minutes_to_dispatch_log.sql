-- Add unit tracking to dispatch_log
alter table dispatch_log
  add column if not exists unit_ids uuid[],
  add column if not exists minutes int;

