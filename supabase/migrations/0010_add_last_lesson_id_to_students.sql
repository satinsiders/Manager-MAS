-- Add last_lesson_id to students and permit updates
alter table students add column last_lesson_id uuid;

-- Allow updates to last_lesson_id and last_lesson_sent along with existing fields
create or replace function restrict_student_updates()
returns trigger as $$
begin
  if (row_to_json(NEW)::jsonb
        - 'current_curriculum_version'
        - 'active'
        - 'last_lesson_sent'
        - 'last_lesson_id'
     ) is distinct from (row_to_json(OLD)::jsonb
        - 'current_curriculum_version'
        - 'active'
        - 'last_lesson_sent'
        - 'last_lesson_id') then
    raise exception 'Only current_curriculum_version, active, last_lesson_sent, and last_lesson_id can be updated';
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists restrict_student_updates on students;
create trigger restrict_student_updates
before update on students
for each row execute function restrict_student_updates();
