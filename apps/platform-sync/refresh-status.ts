import type { VercelRequest, VercelResponse } from '../../packages/shared/vercel';
import { getSession, parseCookieHeader, sessionCookieName } from '../../packages/shared/authSessions';
import { hasStaticPlatformToken } from '../../packages/shared/platformAuth';
import { getRefreshJob, getRefreshJobInternal } from './refreshJob';

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
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const jobIdRaw = req.query.jobId ?? req.query.id;
  const jobId = Array.isArray(jobIdRaw) ? jobIdRaw[0] : (jobIdRaw as string | undefined);
  if (!jobId) {
    res.status(400).json({ error: 'missing_job_id' });
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
  }

  const internalJob = getRefreshJobInternal(jobId);
  if (!internalJob) {
    res.status(404).json({ error: 'job_not_found' });
    return;
  }

  if (!hasStaticToken && internalJob.sessionId && internalJob.sessionId !== session?.id) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }

  const job = getRefreshJob(jobId);
  res.status(200).json({ job });
}

export const config = {
  api: {
    bodyParser: false,
  },
};
