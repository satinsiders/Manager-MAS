# `match_lessons` RPC

Exposes semantic search over the `lessons` table using the `pgvector` extension.

## Parameters

- `query_embedding vector(1536)` – embedding of the search query
- `match_threshold float` – minimum similarity score (0-1)
- `match_count int` – maximum number of lessons to return

## Returns

The function returns each lesson's `id`, `topic`, `difficulty`, `asset_url` and a `similarity` score.

## Example

```sql
select * from match_lessons('[0, 0, ...]', 0.75, 5);
```

Use the `similarity` value to filter results or pick the most relevant lessons.
