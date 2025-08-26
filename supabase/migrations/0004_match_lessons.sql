-- Function to match lessons using pgvector similarity
create or replace function match_lessons(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
) returns table (
  id uuid,
  topic text,
  difficulty int,
  asset_url text,
  similarity float
) as $$
  select
    l.id,
    l.topic,
    l.difficulty,
    l.asset_url,
    1 - (l.vector_embedding <=> query_embedding) as similarity
  from lessons l
  where 1 - (l.vector_embedding <=> query_embedding) > match_threshold
  order by l.vector_embedding <=> query_embedding
  limit match_count;
$$ language sql stable;

-- Index for efficient vector similarity search
create index if not exists lessons_vector_embedding_idx
  on lessons using ivfflat (vector_embedding vector_cosine_ops)
  with (lists = 100);

-- Allow callers to execute the match_lessons function
grant execute on function match_lessons(vector(1536), float, int) to authenticated, anon, service_role;
