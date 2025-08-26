-- Enable RLS on all tables
alter table students enable row level security;
alter table lessons enable row level security;
alter table performances enable row level security;
alter table curricula enable row level security;
alter table assignments enable row level security;
alter table dispatch_log enable row level security;
alter table orchestrator_log enable row level security;

-- Policies for append-only tables
create policy select_lessons on lessons for select using (true);
create policy insert_lessons on lessons for insert with check (true);

create policy select_performances on performances for select using (true);
create policy insert_performances on performances for insert with check (true);

create policy select_assignments on assignments for select using (true);
create policy insert_assignments on assignments for insert with check (true);

create policy select_curricula on curricula for select using (true);
create policy insert_curricula on curricula for insert with check (true);

create policy select_students on students for select using (true);
create policy select_dispatch_log on dispatch_log for select using (true);
create policy select_orchestrator_log on orchestrator_log for select using (true);

-- Unique indexes
create unique index if not exists students_id_idx on students(id);
create unique index if not exists curricula_version_student_idx on curricula(version, student_id);

-- Foreign key constraints with ON DELETE RESTRICT
alter table performances drop constraint if exists performances_student_id_fkey;
alter table performances add constraint performances_student_id_fkey foreign key (student_id) references students(id) on delete restrict;
alter table performances drop constraint if exists performances_lesson_id_fkey;
alter table performances add constraint performances_lesson_id_fkey foreign key (lesson_id) references lessons(id) on delete restrict;

alter table curricula drop constraint if exists curricula_student_id_fkey;
alter table curricula add constraint curricula_student_id_fkey foreign key (student_id) references students(id) on delete restrict;

alter table assignments drop constraint if exists assignments_lesson_id_fkey;
alter table assignments add constraint assignments_lesson_id_fkey foreign key (lesson_id) references lessons(id) on delete restrict;
alter table assignments drop constraint if exists assignments_student_id_fkey;
alter table assignments add constraint assignments_student_id_fkey foreign key (student_id) references students(id) on delete restrict;

alter table dispatch_log drop constraint if exists dispatch_log_student_id_fkey;
alter table dispatch_log add constraint dispatch_log_student_id_fkey foreign key (student_id) references students(id) on delete restrict;
alter table dispatch_log drop constraint if exists dispatch_log_lesson_id_fkey;
alter table dispatch_log add constraint dispatch_log_lesson_id_fkey foreign key (lesson_id) references lessons(id) on delete restrict;

-- Trigger function to prevent updates and deletes on append-only tables
create or replace function prevent_modify_append_only()
returns trigger as $$
begin
  raise exception 'Modifications are not allowed on %', TG_TABLE_NAME;
end;
$$ language plpgsql;

-- Apply triggers
drop trigger if exists prevent_modify_lessons on lessons;
create trigger prevent_modify_lessons before update or delete on lessons for each row execute function prevent_modify_append_only();

drop trigger if exists prevent_modify_performances on performances;
create trigger prevent_modify_performances before update or delete on performances for each row execute function prevent_modify_append_only();

drop trigger if exists prevent_modify_assignments on assignments;
create trigger prevent_modify_assignments before update or delete on assignments for each row execute function prevent_modify_append_only();

drop trigger if exists prevent_modify_curricula on curricula;
create trigger prevent_modify_curricula before update or delete on curricula for each row execute function prevent_modify_append_only();
