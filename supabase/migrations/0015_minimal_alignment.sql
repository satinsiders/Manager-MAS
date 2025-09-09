-- Minimal alignment migration: add missing columns and required extension
create extension if not exists pgcrypto;

-- Stable identifier for study plan versions (formerly `curricula`)
alter table curricula
  add column if not exists id uuid default gen_random_uuid();

-- Assignment duration expected by application logic
alter table assignments
  add column if not exists duration_minutes int;

-- Dispatcher writes requested_lesson_id for traceability
alter table dispatch_log
  add column if not exists requested_lesson_id uuid;

