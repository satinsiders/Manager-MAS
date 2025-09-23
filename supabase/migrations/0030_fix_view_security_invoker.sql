-- Ensure views are explicitly SECURITY INVOKER to honor caller RLS/permissions
-- This migration recreates views flagged by linter as SECURITY DEFINER in live DBs.

-- study_plans
drop view if exists public.study_plans cascade;
create view public.study_plans security invoker as
  select
    id,
    version,
    student_id,
    curriculum as study_plan,
    qa_user,
    approved_at
  from curricula;

-- study_plan_drafts
drop view if exists public.study_plan_drafts cascade;
create view public.study_plan_drafts security invoker as
  select
    student_id,
    version,
    curriculum as study_plan,
    created_at
  from curricula_drafts;

-- student_progress
drop view if exists public.student_progress cascade;
create view public.student_progress security invoker as
select
  spp.student_id,
  spp.question_type,
  (spp.status = 'mastered') as mastered
from study_plan_progress spp
join students s on s.id = spp.student_id
join curricula c on c.id = spp.study_plan_id and c.student_id = s.id and c.version = s.current_curriculum_version;

-- dispatch_mirror
drop view if exists public.dispatch_mirror cascade;
create view public.dispatch_mirror security invoker as
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

-- daily_performance_mirror
drop view if exists public.daily_performance_mirror cascade;
create view public.daily_performance_mirror security invoker as
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

