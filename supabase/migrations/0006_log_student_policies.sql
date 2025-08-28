-- Insert and update policies for log tables and students

-- Allow inserts and updates on dispatch_log
create policy insert_dispatch_log on dispatch_log for insert with check (true);
create policy update_dispatch_log on dispatch_log for update using (true) with check (true);

-- Allow inserts and updates on orchestrator_log
create policy insert_orchestrator_log on orchestrator_log for insert with check (true);
create policy update_orchestrator_log on orchestrator_log for update using (true) with check (true);

-- Allow updates on students
create policy update_students on students for update using (true) with check (true);

-- Restrict student updates to specific columns
create or replace function restrict_student_updates()
returns trigger as $$
begin
  if (row_to_json(NEW)::jsonb - 'current_curriculum_version' - 'active')
     is distinct from (row_to_json(OLD)::jsonb - 'current_curriculum_version' - 'active') then
    raise exception 'Only current_curriculum_version and active can be updated';
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists restrict_student_updates on students;
create trigger restrict_student_updates
before update on students
for each row execute function restrict_student_updates();
