import { SUPERFASTSAT_API_URL } from './config';
import { supabase } from './supabase';
import {
  getPlatformAuthToken,
  hasStaticPlatformToken,
  invalidatePlatformToken,
} from './platformAuth';

const BASE_URL = SUPERFASTSAT_API_URL.replace(/\/$/, '');

export type PlatformFetchOptions = RequestInit & { skipAuth?: boolean };

function buildUrl(path: string): string {
  if (/^https?:/i.test(path)) return path;
  return `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function platformFetch(path: string, init: PlatformFetchOptions = {}) {
  const url = buildUrl(path);
  async function execute(token?: string) {
    const headers = new Headers(init.headers ?? {});
    if (!init.skipAuth && token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return fetch(url, { ...init, headers });
  }

  if (init.skipAuth) {
    return execute();
  }

  let token = await getPlatformAuthToken();
  let response = await execute(token);
  if (response.status === 401 && !hasStaticPlatformToken()) {
    invalidatePlatformToken(token);
    token = await getPlatformAuthToken(true);
    response = await execute(token);
  }
  return response;
}

export async function platformCallWithRetry(
  path: string,
  init: PlatformFetchOptions = {},
  runType: string,
  step: string,
  retries = 3,
  logTable = 'service_log',
) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await platformFetch(path, init);
      if (!response.ok) {
        if (response.status === 401 && !hasStaticPlatformToken()) {
          invalidatePlatformToken();
        }
        throw new Error(`HTTP ${response.status}`);
      }
      await supabase.from(logTable).insert({
        run_type: runType,
        step,
        success: true,
        run_at: new Date().toISOString(),
      });
      return response;
    } catch (err: any) {
      if (attempt === retries) {
        await supabase.from(logTable).insert({
          run_type: runType,
          step,
          success: false,
          message: err?.message ?? String(err),
          run_at: new Date().toISOString(),
        });
        return null;
      }
    }
  }
  return null;
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
