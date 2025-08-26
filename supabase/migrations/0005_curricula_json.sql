-- Migrate curricula table to store structured curriculum JSON
alter table curricula
  add column if not exists curriculum jsonb,
  add column if not exists qa_user text,
  add column if not exists approved_at timestamptz;

-- Convert existing data if needed
update curricula
set curriculum = jsonb_build_object(
  'version', version,
  'student_id', student_id,
  'notes', coalesce(notes, ''),
  'lessons', (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', lesson_id,
        'units', jsonb_build_array(
          jsonb_build_object('id', lesson_id, 'duration_minutes', 1)
        )
      )
    ), '[]'::jsonb)
    from unnest(coalesce(lesson_ids, '{}'::uuid[])) as lesson_id
  )
)
where curriculum is null;

-- Drop old columns
alter table curricula
  drop column if exists lesson_ids,
  drop column if exists notes;
