-- Align view names with documentation terminology (dispatch_mirror and daily_performance_mirror)
create or replace view dispatch_mirror as
  select
    student_id,
    external_curriculum_id as platform_curriculum_id,
    student_curriculum_id,
    raw_title,
    total_minutes,
    remaining_minutes,
    first_dispatched_at,
    last_dispatched_at,
    ingested_at
  from platform_dispatches;

create or replace view daily_performance_mirror as
  select
    student_id,
    date,
    external_curriculum_id as platform_curriculum_id,
    bundle_ref,
    avg_correctness,
    avg_confidence,
    units,
    ingested_at
  from daily_performance;
