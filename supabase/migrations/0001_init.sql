create table if not exists lessons (
  id bigserial primary key,
  title text not null,
  content text,
  created_at timestamptz default now()
);

create table if not exists scores (
  id bigserial primary key,
  user_id uuid not null,
  lesson_id bigint references lessons(id),
  score integer not null,
  created_at timestamptz default now()
);
