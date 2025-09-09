-- Question Type Taxonomy and Curriculum Catalog Mirror
create extension if not exists pgcrypto;

create table if not exists question_types (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  category text not null,
  specific_type text not null,
  canonical_path text not null unique,
  created_at timestamptz default now()
);

alter table question_types enable row level security;
create policy select_question_types on question_types for select using (true);
create policy insert_question_types on question_types for insert with check (true);

-- Optional link from lessons to taxonomy (nullable until backfilled)
alter table lessons add column if not exists question_type_id uuid references question_types(id);
create index if not exists lessons_question_type_id_idx on lessons(question_type_id);

-- Curriculum Catalog mirror mapping external curricula to taxonomy
create table if not exists curriculum_catalog (
  external_curriculum_id text primary key,
  raw_title text not null,
  question_type_id uuid not null references question_types(id) on delete restrict,
  subtype text,
  active boolean default true,
  ingested_at timestamptz default now()
);

alter table curriculum_catalog enable row level security;
create policy select_curriculum_catalog on curriculum_catalog for select using (true);
create policy insert_curriculum_catalog on curriculum_catalog for insert with check (true);
create policy update_curriculum_catalog on curriculum_catalog for update using (true) with check (true);

