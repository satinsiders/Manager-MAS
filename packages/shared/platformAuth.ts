import {
  SUPERFASTSAT_API_URL,
  SUPERFASTSAT_API_TOKEN,
  SUPERFASTSAT_TEACHER_EMAIL,
  SUPERFASTSAT_TEACHER_PASSWORD,
} from './config';

let cachedToken: string | null = null;
let inflight: Promise<string> | null = null;

function baseUrl(): string {
  return SUPERFASTSAT_API_URL.replace(/\/$/, '');
}

export function hasStaticPlatformToken(): boolean {
  return Boolean(SUPERFASTSAT_API_TOKEN);
}

export function isPlatformAuthConfigured(): boolean {
  return (
    hasStaticPlatformToken() ||
    Boolean(SUPERFASTSAT_TEACHER_EMAIL && SUPERFASTSAT_TEACHER_PASSWORD)
  );
}

async function requestTeacherToken(): Promise<string> {
  if (!SUPERFASTSAT_TEACHER_EMAIL || !SUPERFASTSAT_TEACHER_PASSWORD) {
    throw new Error('Teacher credentials are not configured for platform auth');
  }
  const loginUrl = `${baseUrl()}/auth/login`;
  const resp = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: SUPERFASTSAT_TEACHER_EMAIL,
      password: SUPERFASTSAT_TEACHER_PASSWORD,
    }),
  });
  if (!resp.ok) {
    const message = await resp.text().catch(() => resp.statusText);
    throw new Error(`Teacher login failed (${resp.status} ${resp.statusText}): ${message}`);
  }
  let token: unknown;
  try {
    const data = await resp.json();
    token =
      data?.token ??
      data?.access_token ??
      data?.accessToken ??
      data?.toekn ??
      null;
  } catch (err) {
    throw new Error(`Teacher login response parsing failed: ${(err as Error).message}`);
  }
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('Teacher login response did not include an access token');
  }
  cachedToken = token;
  return token;
}

export async function getPlatformAuthToken(forceRefresh = false): Promise<string> {
  if (SUPERFASTSAT_API_TOKEN) return SUPERFASTSAT_API_TOKEN;
  if (!isPlatformAuthConfigured()) {
    throw new Error('Platform API auth is not configured');
  }
  if (forceRefresh) {
    cachedToken = null;
  }
  if (cachedToken) return cachedToken;
  if (!inflight) {
    inflight = requestTeacherToken().finally(() => {
      inflight = null;
    });
  }
  cachedToken = await inflight;
  return cachedToken;
}

export function invalidatePlatformToken(oldToken?: string) {
  if (SUPERFASTSAT_API_TOKEN) return; // static tokens do not refresh
  if (oldToken && cachedToken && oldToken !== cachedToken) return;
  cachedToken = null;
}
