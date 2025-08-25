-- Enable pgvector for similarity search
create extension if not exists vector;

-- Students table
create table if not exists students (
  id uuid primary key,
  name text not null,
  timezone text not null,
  current_curriculum_version int,
  last_lesson_sent timestamptz
);

-- Lessons catalog (immutable)
create table if not exists lessons (
  id uuid primary key,
  topic text not null,
  difficulty int not null,
  asset_url text,
  vector_embedding vector(1536)
);

-- Performances (append only)
create table if not exists performances (
  id uuid primary key,
  student_id uuid references students(id),
  lesson_id uuid references lessons(id),
  score numeric,
  timestamp timestamptz default now()
);

-- Curricula with versioning
create table if not exists curricula (
  version int,
  student_id uuid references students(id),
  lesson_ids uuid[] default '{}',
  notes text,
  primary key(version, student_id)
);

-- Supplemental assignments
create table if not exists assignments (
  id uuid primary key,
  lesson_id uuid references lessons(id),
  student_id uuid references students(id),
  questions_json jsonb,
  generated_by text
);

-- Dispatch log for visibility
create table if not exists dispatch_log (
  id uuid primary key,
  student_id uuid references students(id),
  lesson_id uuid references lessons(id),
  sent_at timestamptz,
  channel text,
  status text
);
