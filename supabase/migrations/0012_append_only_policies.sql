-- Deny updates and deletes on append-only tables beyond curricula
create policy update_lessons_denied on lessons for update using (false) with check (false);
create policy delete_lessons_denied on lessons for delete using (false);

create policy update_performances_denied on performances for update using (false) with check (false);
create policy delete_performances_denied on performances for delete using (false);

create policy update_assignments_denied on assignments for update using (false) with check (false);
create policy delete_assignments_denied on assignments for delete using (false);
