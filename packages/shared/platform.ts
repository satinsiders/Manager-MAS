import { SUPERFASTSAT_API_URL, SUPERFASTSAT_API_TOKEN } from './config';

const BASE_URL = SUPERFASTSAT_API_URL.replace(/\/$/, '');

export type PlatformFetchOptions = RequestInit & { skipAuth?: boolean };

function buildUrl(path: string): string {
  if (/^https?:/i.test(path)) return path;
  return `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function platformFetch(path: string, init: PlatformFetchOptions = {}) {
  const url = buildUrl(path);
  const headers = new Headers(init.headers ?? {});
  if (!init.skipAuth) {
    headers.set('Authorization', `Bearer ${SUPERFASTSAT_API_TOKEN}`);
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(url, { ...init, headers });
}

export async function platformJson<T = any>(path: string, init: PlatformFetchOptions = {}): Promise<T> {
  const resp = await platformFetch(path, init);
  if (!resp.ok) {
    const message = await resp.text().catch(() => resp.statusText);
    throw new Error(`Platform API ${resp.status} ${resp.statusText}: ${message}`);
  }
  if (resp.status === 204 || resp.headers.get('content-length') === '0') {
    return undefined as T;
  }
  const text = await resp.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new Error(`Failed to parse Platform API response: ${(err as Error).message}`);
  }
}
