import { SUPERFASTSAT_API_URL, SUPERFASTSAT_API_TOKEN } from './config';
import {
  destroySession,
  getCurrentSessionId,
  getSession,
  getSessionMaxAgeSeconds,
  getSessionToken,
} from './authSessions';

type TeacherCredentials = {
  email: string;
  password: string;
};

function baseUrl(): string {
  return SUPERFASTSAT_API_URL.replace(/\/$/, '');
}

export function hasStaticPlatformToken(): boolean {
  return Boolean(SUPERFASTSAT_API_TOKEN);
}

export function isPlatformAuthConfigured(): boolean {
  if (hasStaticPlatformToken()) return true;
  const sessionId = getCurrentSessionId();
  if (!sessionId) return false;
  return Boolean(getSessionToken(sessionId));
}

export function getCurrentSession(): ReturnType<typeof getSession> {
  const sessionId = getCurrentSessionId();
  return getSession(sessionId);
}

async function requestTeacherToken(credentials: TeacherCredentials): Promise<string> {
  const loginUrl = `${baseUrl()}/auth/login`;
  const resp = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: credentials.email,
      password: credentials.password,
    }),
  });
  if (!resp.ok) {
    const message = await resp.text().catch(() => resp.statusText);
    throw new Error(`Teacher login failed (${resp.status} ${resp.statusText}): ${message}`);
  }
  let token: unknown;
  try {
    const data = await resp.json();
    token = data?.token ?? data?.access_token ?? data?.accessToken ?? data?.toekn ?? null;
  } catch (err) {
    throw new Error(`Teacher login response parsing failed: ${(err as Error).message}`);
  }
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('Teacher login response did not include an access token');
  }
  return token;
}

export async function authenticateTeacher(credentials: TeacherCredentials): Promise<string> {
  return requestTeacherToken(credentials);
}

export async function getPlatformAuthToken(forceRefresh = false): Promise<string> {
  if (SUPERFASTSAT_API_TOKEN) return SUPERFASTSAT_API_TOKEN;
  const sessionId = getCurrentSessionId();
  if (!sessionId) {
    throw new Error('Platform API auth requires an active session');
  }
  const sessionToken = getSessionToken(sessionId);
  if (!sessionToken) {
    throw new Error('Active session is not authenticated with the platform');
  }
  if (forceRefresh) {
    // Sessions cannot refresh tokens without re-login; forceRefresh triggers session invalidation
    destroySession(sessionId, 'expired');
    throw new Error('Platform token refresh requires a new login');
  }
  return sessionToken;
}

export function invalidatePlatformToken(oldToken?: string) {
  if (hasStaticPlatformToken()) return; // static tokens do not refresh
  const sessionId = getCurrentSessionId();
  if (!sessionId) return;
  const session = getSession(sessionId);
  if (session && (!oldToken || session.token === oldToken)) {
    destroySession(sessionId, 'expired');
  }
}

export function getSessionCookieMaxAge(): number {
  return getSessionMaxAgeSeconds();
}
