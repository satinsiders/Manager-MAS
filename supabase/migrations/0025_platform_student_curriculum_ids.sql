-- Track platform student curriculum identifiers for dispatch mirrors and logs
alter table platform_dispatches
  add column if not exists student_curriculum_id text;

update platform_dispatches
  set student_curriculum_id = coalesce(student_curriculum_id, external_curriculum_id);

alter table platform_dispatches
  drop constraint if exists platform_dispatches_student_id_external_curriculum_id_key;

alter table platform_dispatches
  add constraint platform_dispatches_student_curriculum_unique
    unique (student_id, student_curriculum_id);

create index if not exists platform_dispatches_student_curriculum_idx
  on platform_dispatches(student_curriculum_id);

alter table dispatch_log
  add column if not exists platform_student_curriculum_id text;

alter table mas_actions
  add column if not exists platform_student_curriculum_id text;

alter table students
  add column if not exists platform_student_id text;

create unique index if not exists students_platform_student_id_idx
  on students(platform_student_id)
  where platform_student_id is not null;
