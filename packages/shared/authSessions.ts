import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';
import { supabase } from './supabase';

const SESSION_STORE = new Map<string, SessionRecord>();
const SESSION_CONTEXT = new AsyncLocalStorage<string | null>();
const SESSION_DESTROY_LISTENERS: Array<(sessionId: string, session: SessionRecord) => void> = [];

const SESSION_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours
const SESSION_COOKIE_NAME = 'mas_session';
const SESSION_MAX_AGE_SECONDS = Math.floor(SESSION_TTL_MS / 1000);

export type SessionRecord = {
  id: string;
  email: string;
  token: string;
  hashedToken: string;
  createdAt: number;
  lastActiveAt: number;
  metadata?: {
    ip?: string | null;
    userAgent?: string | null;
  };
};

type SessionEvent = 'login' | 'logout' | 'expired';

type SessionOptions = {
  email: string;
  token: string;
  ip?: string | null;
  userAgent?: string | null;
};

export const sessionCookieName = SESSION_COOKIE_NAME;

export function generateSessionId(): string {
  return randomBytes(32).toString('base64url');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function logSessionEvent(event: SessionEvent, session: SessionRecord) {
  try {
    await supabase.from('service_log').insert({
      run_type: 'chat_auth',
      step: event,
      success: true,
      message: JSON.stringify({
        email: session.email,
        hashedToken: session.hashedToken,
        lastActiveAt: new Date(session.lastActiveAt).toISOString(),
        metadata: session.metadata ?? null,
      }),
      run_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to record session event', event, error);
  }
}

export function createSession(options: SessionOptions): SessionRecord {
  const id = generateSessionId();
  const now = Date.now();
  const record: SessionRecord = {
    id,
    email: options.email,
    token: options.token,
    hashedToken: hashToken(options.token),
    createdAt: now,
    lastActiveAt: now,
    metadata: {
      ip: options.ip ?? null,
      userAgent: options.userAgent ?? null,
    },
  };
  SESSION_STORE.set(id, record);
  void logSessionEvent('login', record);
  return record;
}

export function touchSession(sessionId: string): void {
  const session = SESSION_STORE.get(sessionId);
  if (!session) return;
  session.lastActiveAt = Date.now();
}

export function getSession(sessionId: string | undefined | null): SessionRecord | null {
  if (!sessionId) return null;
  const session = SESSION_STORE.get(sessionId);
  if (!session) return null;
  if (Date.now() - session.lastActiveAt > SESSION_TTL_MS) {
    destroySession(sessionId, 'expired');
    return null;
  }
  return session;
}

export function getSessionToken(sessionId: string | undefined | null): string | null {
  const session = getSession(sessionId);
  return session ? session.token : null;
}

export function destroySession(sessionId: string | undefined | null, event: SessionEvent = 'logout'): void {
  if (!sessionId) return;
  const session = SESSION_STORE.get(sessionId);
  if (!session) return;
  SESSION_STORE.delete(sessionId);
  void logSessionEvent(event, session);
  for (const listener of SESSION_DESTROY_LISTENERS) {
    try {
      listener(sessionId, session);
    } catch (error) {
      console.error('Session destroy listener failed', error);
    }
  }
}

export function withSessionContext<T>(sessionId: string | null, fn: () => T): T {
  return SESSION_CONTEXT.run(sessionId, fn);
}

export async function withSessionContextAsync<T>(sessionId: string | null, fn: () => Promise<T>): Promise<T> {
  return SESSION_CONTEXT.run(sessionId, fn);
}

export function getCurrentSessionId(): string | null {
  return SESSION_CONTEXT.getStore() ?? null;
}

export function serializeSessionCookie(value: string, options: { secure?: boolean; maxAgeSeconds?: number } = {}): string {
  const segments = [`${SESSION_COOKIE_NAME}=${value}`];
  segments.push('Path=/');
  segments.push('HttpOnly');
  segments.push('SameSite=Strict');
  const maxAge = options.maxAgeSeconds ?? SESSION_MAX_AGE_SECONDS;
  if (Number.isFinite(maxAge)) {
    segments.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  }
  if (options.secure) {
    segments.push('Secure');
  }
  return segments.join('; ');
}

export function clearSessionCookie(options: { secure?: boolean } = {}): string {
  return serializeSessionCookie('', { secure: options.secure, maxAgeSeconds: 0 });
}

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const result: Record<string, string> = {};
  const pairs = header.split(';');
  for (const pair of pairs) {
    const index = pair.indexOf('=');
    if (index === -1) continue;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (!key) continue;
    result[key] = decodeURIComponent(value);
  }
  return result;
}

export function isSameSession(a: string, b: string): boolean {
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export function getSessionMaxAgeSeconds(): number {
  return SESSION_MAX_AGE_SECONDS;
}

export function getSessionExpirationDate(session: SessionRecord): Date {
  return new Date(session.createdAt + SESSION_TTL_MS);
}

export function onSessionDestroyed(listener: (sessionId: string, session: SessionRecord) => void) {
  SESSION_DESTROY_LISTENERS.push(listener);
}
