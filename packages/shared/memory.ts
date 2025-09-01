import { Redis } from '@upstash/redis';
import { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } from './config';

const redis = new Redis({
  url: UPSTASH_REDIS_REST_URL,
  token: UPSTASH_REDIS_REST_TOKEN,
});

export const DEFAULT_DRAFT_TTL = parseInt(process.env.DRAFT_TTL ?? '3600', 10);

let client: any = redis;

export function setMemoryClient(newClient: any) {
  client = newClient;
}

export async function writeDraft<T>(
  key: string,
  value: T,
  ttl = DEFAULT_DRAFT_TTL,
) {
  await client.set(`draft:${key}`, JSON.stringify(value), { ex: ttl });
}

export async function readDraft<T>(key: string): Promise<T | null> {
  const data = await client.get(`draft:${key}`);
  if (!data) return null;
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as T;
    } catch {
      return data as any;
    }
  }
  return data as T;
}

export async function deleteDraft(key: string) {
  await client.del(`draft:${key}`);
}
