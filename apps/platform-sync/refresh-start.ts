import type { VercelRequest, VercelResponse } from '../../packages/shared/vercel';
import { getSession, parseCookieHeader, sessionCookieName } from '../../packages/shared/authSessions';
import { hasStaticPlatformToken } from '../../packages/shared/platformAuth';
import { startRefreshJob } from './refreshJob';

function getSessionIdFromRequest(req: VercelRequest): string | null {
  const header = (req.headers['cookie'] as string) ?? '';
  const cookies = parseCookieHeader(header);
  const fromHeader = cookies[sessionCookieName];
  if (fromHeader) return fromHeader;
  if (req.cookies && typeof req.cookies === 'object') {
    const direct = (req.cookies as Record<string, string | undefined>)[sessionCookieName];
    if (direct) return direct;
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const hasStaticToken = hasStaticPlatformToken();
  const sessionId = getSessionIdFromRequest(req);
  const session = hasStaticToken ? null : getSession(sessionId);
  if (!hasStaticToken) {
    if (!session) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }
    if (!session.token) {
      res.status(400).json({ error: 'platform_auth_not_configured' });
      return;
    }
  }

  let studentIds: string[] | null = null;
  if (req.body && typeof req.body === 'object') {
    const raw = (req.body as Record<string, unknown>).studentIds;
    if (Array.isArray(raw)) {
      studentIds = raw.map((value) => String(value)).filter(Boolean);
      if (studentIds.length === 0) studentIds = null;
    }
  }

  try {
    const job = await startRefreshJob({ sessionId: session?.id ?? null, studentIds });
    res.status(202).json({ jobId: job.id, job });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to start refresh job', message);
    res.status(500).json({ error: message });
  }
}

export const config = {
  api: {
    bodyParser: true,
  },
};
