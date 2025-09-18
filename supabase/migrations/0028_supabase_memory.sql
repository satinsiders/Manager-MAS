-- Draft cache and recent score tables replacing Redis usage
create table if not exists draft_cache (
  cache_key text primary key,
  value jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

alter table draft_cache enable row level security;
create policy select_draft_cache on draft_cache for select using (true);
create policy insert_draft_cache on draft_cache for insert with check (true);
create policy update_draft_cache on draft_cache for update using (true) with check (true);
create policy delete_draft_cache on draft_cache for delete using (true);

create index if not exists draft_cache_expires_idx on draft_cache(expires_at);

create table if not exists student_recent_scores (
  student_id uuid primary key references students(id) on delete cascade,
  scores numeric[] not null default '{}',
  updated_at timestamptz default now()
);

alter table student_recent_scores enable row level security;
create policy select_student_recent_scores on student_recent_scores for select using (true);
create policy insert_student_recent_scores on student_recent_scores for insert with check (true);
create policy update_student_recent_scores on student_recent_scores for update using (true) with check (true);
