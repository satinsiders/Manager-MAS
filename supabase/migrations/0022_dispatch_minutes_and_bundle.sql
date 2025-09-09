-- Add requested/actual minutes and bundle fingerprint to dispatch_log
alter table dispatch_log
  add column if not exists requested_minutes int,
  add column if not exists actual_minutes int,
  add column if not exists platform_bundle_ref text;

