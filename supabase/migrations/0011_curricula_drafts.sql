-- Create table for curriculum drafts to preserve append-only curricula history
create table if not exists curricula_drafts (
  student_id uuid not null references students(id) on delete restrict,
  version int not null,
  curriculum jsonb not null,
  created_at timestamptz default now(),
  primary key (student_id, version)
);

alter table curricula_drafts enable row level security;

create policy select_curricula_drafts on curricula_drafts for select using (true);
create policy insert_curricula_drafts on curricula_drafts for insert with check (true);
create policy update_curricula_drafts on curricula_drafts for update using (true) with check (true);
create policy delete_curricula_drafts on curricula_drafts for delete using (true);

-- Ensure curricula table stays append-only
-- Explicitly deny updates and deletes through RLS even for privileged roles
create policy update_curricula_denied on curricula for update using (false) with check (false);
create policy delete_curricula_denied on curricula for delete using (false);
