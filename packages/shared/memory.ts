import { supabase } from './supabase';

export const DEFAULT_DRAFT_TTL = parseInt(process.env.DRAFT_TTL ?? '3600', 10);

let client = supabase;

export function setMemoryClient(newClient: typeof supabase) {
  client = newClient;
}

export async function writeDraft<T>(
  key: string,
  value: T,
  ttl = DEFAULT_DRAFT_TTL,
) {
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  await client
    .from('draft_cache')
    .upsert({
      cache_key: `draft:${key}`,
      value,
      expires_at: expiresAt,
    });
}

export async function readDraft<T>(key: string): Promise<T | null> {
  const now = new Date();
  const { data } = await client
    .from('draft_cache')
    .select('value, expires_at')
    .eq('cache_key', `draft:${key}`)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const expiresAt = data.expires_at ? new Date(data.expires_at) : null;
  if (expiresAt && expiresAt <= now) {
    await deleteDraft(key);
    return null;
  }
  return (data.value ?? null) as T | null;
}

export async function deleteDraft(key: string) {
    await client
      .from('draft_cache')
      .delete()
      .eq('cache_key', `draft:${key}`);
}
