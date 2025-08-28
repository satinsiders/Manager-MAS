-- Generic service log table and policies
create table if not exists service_log (
  id uuid primary key,
  run_type text,
  step text,
  success boolean,
  message text,
  run_at timestamptz default now()
);

alter table service_log enable row level security;

create policy select_service_log on service_log for select using (true);
create policy insert_service_log on service_log for insert with check (true);
create policy update_service_log on service_log for update using (true) with check (true);
