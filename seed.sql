with algebra_qtype as (
  select id
  from question_types
  where canonical_path = 'math > algebra > linear equations in one variable'
  limit 1
)
insert into curriculum_catalog (external_curriculum_id, raw_title, question_type_id, subtype, active)
select 'demo-curriculum', 'Algebra Fundamentals', id, 'core', true
from algebra_qtype
on conflict (external_curriculum_id) do update
  set raw_title = excluded.raw_title,
      question_type_id = excluded.question_type_id,
      subtype = excluded.subtype,
      active = excluded.active;

insert into students (id, name, timezone, current_curriculum_version, active, preferred_topics, platform_student_id)
values ('22222222-2222-2222-2222-222222222222', 'Demo Student', 'America/New_York', 1, true, ARRAY['algebra'], 'platform-demo')
on conflict (id) do update set current_curriculum_version = excluded.current_curriculum_version;

insert into curricula (id, student_id, version, curriculum, qa_user, approved_at)
values (
  '33333333-3333-3333-3333-333333333333',
  '22222222-2222-2222-2222-222222222222',
  1,
  '{
    "version": 1,
    "student_id": "22222222-2222-2222-2222-222222222222",
    "notes": "Demo plan",
    "curricula": [
      {
        "id": "demo-curriculum",
        "minutes_recommended": 20,
        "strategy": "Focus on algebra basics",
        "units": [
          { "id": "unit-1", "title": "Warmup Set", "duration_minutes": 20 }
        ]
      }
    ]
  }'::jsonb,
  'qa-demo',
  now()
)
on conflict (student_id, version) do update set curriculum = excluded.curriculum;
