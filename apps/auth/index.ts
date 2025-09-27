import type { VercelRequest, VercelResponse } from '../../packages/shared/vercel';
import { SUPERFASTSAT_API_TOKEN } from '../../packages/shared/config';
import {
  authenticateTeacher,
  getSessionCookieMaxAge,
  hasStaticPlatformToken,
} from '../../packages/shared/platformAuth';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  getSession,
  getSessionExpirationDate,
  parseCookieHeader,
  serializeSessionCookie,
  sessionCookieName,
  touchSession,
} from '../../packages/shared/authSessions';

function respond(res: VercelResponse, status: number, payload: unknown) {
  res.status(status).json(payload);
}

function getSecureFlag(req: VercelRequest): boolean {
  if (process.env.NODE_ENV === 'production') return true;
  const proto = (req.headers['x-forwarded-proto'] as string) ?? '';
  return proto.split(',')[0]?.trim() === 'https';
}

function extractBody(req: VercelRequest): any {
  const body = req.body;
  if (!body) return null;
  if (typeof body === 'object') return body;
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }
  return null;
}

function getSessionIdFromCookies(req: VercelRequest): string | null {
  const header = (req.headers['cookie'] as string) ?? '';
  const cookies = parseCookieHeader(header);
  const fromParsed = cookies[sessionCookieName];
  if (fromParsed) return fromParsed;
  if (req.cookies && typeof req.cookies === 'object') {
    const direct = (req.cookies as Record<string, string | undefined>)[sessionCookieName];
    if (direct) return direct;
  }
  return null;
}

function getClientMetadata(req: VercelRequest) {
  const forwardedFor = (req.headers['x-forwarded-for'] as string) ?? '';
  const ip = forwardedFor.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
  const userAgent = (req.headers['user-agent'] as string) ?? null;
  return { ip, userAgent };
}

function handleNotFound(res: VercelResponse) {
  respond(res, 404, { error: 'not_found' });
}

async function handleLogin(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    respond(res, 405, { error: 'method_not_allowed' });
    return;
  }

  if (hasStaticPlatformToken()) {
    respond(res, 409, {
      error: 'static_token_configured',
      message: 'This deployment uses a static platform token. Interactive login is disabled.',
    });
    return;
  }

  const payload = extractBody(req);
  const email = payload?.email ? String(payload.email).trim() : '';
  const password = payload?.password ? String(payload.password) : '';
  if (!email || !password) {
    respond(res, 400, { error: 'missing_credentials' });
    return;
  }

  try {
    const token = await authenticateTeacher({ email, password });
    const metadata = getClientMetadata(req);
    const session = createSession({ email, token, ...metadata });
    const secure = getSecureFlag(req);
    const cookie = serializeSessionCookie(session.id, {
      secure,
      maxAgeSeconds: getSessionCookieMaxAge(),
    });
    res.setHeader('Set-Cookie', cookie);
    touchSession(session.id);
    respond(res, 200, {
      loggedIn: true,
      email: session.email,
      expiresAt: getSessionExpirationDate(session).toISOString(),
    });
  } catch (error: any) {
    respond(res, 401, {
      error: 'login_failed',
      message: error?.message ?? 'Login failed',
    });
  }
}

function handleLogout(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    respond(res, 405, { error: 'method_not_allowed' });
    return;
  }
  const sessionId = getSessionIdFromCookies(req);
  destroySession(sessionId, 'logout');
  const secure = getSecureFlag(req);
  res.setHeader('Set-Cookie', clearSessionCookie({ secure }));
  respond(res, 200, { loggedIn: false });
}

function handleSession(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    respond(res, 405, { error: 'method_not_allowed' });
    return;
  }

  if (hasStaticPlatformToken() && SUPERFASTSAT_API_TOKEN) {
    respond(res, 200, {
      loggedIn: true,
      mode: 'static',
      email: 'static-token-user',
      expiresAt: null,
    });
    return;
  }

  const sessionId = getSessionIdFromCookies(req);
  const session = getSession(sessionId);
  if (!session) {
    respond(res, 200, { loggedIn: false, mode: 'interactive' });
    return;
  }
  touchSession(session.id);
  respond(res, 200, {
    loggedIn: true,
    mode: 'interactive',
    email: session.email,
    expiresAt: getSessionExpirationDate(session).toISOString(),
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = (req.url ?? '').replace(/\?.*$/, '');
  if (path.endsWith('/login')) {
    await handleLogin(req, res);
    return;
  }
  if (path.endsWith('/logout')) {
    handleLogout(req, res);
    return;
  }
  if (path.endsWith('/session')) {
    handleSession(req, res);
    return;
  }
  handleNotFound(res);
}
