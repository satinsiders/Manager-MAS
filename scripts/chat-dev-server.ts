import { createServer } from 'http';
import { parse } from 'url';
import authHandler from '../apps/auth/index';
import chatHandler from '../apps/chat/index';
import chatUIHandler from '../apps/chat-ui/index';
import studyPlanHandler from '../apps/study-plans/index';
import dashboardHandler from '../apps/dashboard/index';
import activityLogHandler from '../apps/activity-log/index';
import platformRefreshHandler from '../apps/platform-sync/refresh';
import platformRefreshStartHandler from '../apps/platform-sync/refresh-start';
import platformRefreshStatusHandler from '../apps/platform-sync/refresh-status';
import type { VercelRequest, VercelResponse } from '../packages/shared/vercel';
import { parseCookieHeader } from '../packages/shared/authSessions';

function decorateRequest(req: any, body: unknown): VercelRequest {
  const url = parse(req.url ?? '/', true);
  req.query = url.query as Record<string, string | string[]>;
  req.body = body;
  req.cookies = parseCookieHeader(req.headers?.cookie);
  return req as VercelRequest;
}

function wrapResponse(res: any): VercelResponse {
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload: unknown) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
  };
  res.send = (payload: unknown) => {
    if (typeof payload === 'string' || Buffer.isBuffer(payload)) {
      res.end(payload);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(payload));
    }
  };
  return res as VercelResponse;
}

function resolvePort() {
  const sources = [process.env.PORT, process.env.MAS_CHAT_PORT];
  for (const source of sources) {
    if (!source) continue;
    const parsed = Number.parseInt(source, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    console.warn(`Ignoring invalid port value: ${source}`);
  }

  if (process.env.NODE_ENV === 'production') {
    const message = 'PORT environment variable is required in production environments.';
    console.error(message);
    throw new Error(message);
  }

  return 4321;
}

const PORT = resolvePort();

createServer(async (incoming, outgoing) => {
  const chunks: Buffer[] = [];
  for await (const chunk of incoming) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString();
  let parsedBody: unknown = undefined;
  if (raw) {
    try {
      parsedBody = JSON.parse(raw);
    } catch {
      parsedBody = raw;
    }
  }

  const req = decorateRequest(incoming, parsedBody);
  const res = wrapResponse(outgoing);

  try {
    // Handle chat API requests first
    if (req.url?.startsWith('/api/chat')) {
      await chatHandler(req, res);
      return;
    }

    if (req.url?.startsWith('/api/study-plans')) {
      req.url = req.url.replace('/api/study-plans', '') || '/';
      await studyPlanHandler(req, res);
      return;
    }

    if (req.url?.startsWith('/api/platform-sync/refresh/start')) {
      req.url = req.url.replace('/api/platform-sync/refresh/start', '') || '/';
      await platformRefreshStartHandler(req, res);
      return;
    }

    if (req.url?.startsWith('/api/platform-sync/refresh/status')) {
      req.url = req.url.replace('/api/platform-sync/refresh/status', '') || '/';
      await platformRefreshStatusHandler(req, res);
      return;
    }

    if (req.url?.startsWith('/api/platform-sync/refresh')) {
      req.url = req.url.replace('/api/platform-sync/refresh', '') || '/';
      await platformRefreshHandler(req, res);
      return;
    }

    if (req.url?.startsWith('/api/dashboard')) {
      req.url = req.url.replace('/api/dashboard', '') || '/';
      await dashboardHandler(req, res);
      return;
    }

    if (req.url?.startsWith('/api/activity-log')) {
      req.url = req.url.replace('/api/activity-log', '') || '/';
      await activityLogHandler(req, res);
      return;
    }

    if (req.url?.startsWith('/api/auth')) {
      req.url = req.url.replace('/api/auth', '') || '/';
      await authHandler(req, res);
      return;
    }

    // For all other paths, treat as UI requests (this includes /, /static/, etc)
    // Strip /api/chat-ui prefix if present
    if (req.url?.startsWith('/api/chat-ui')) {
      req.url = req.url.replace('/api/chat-ui', '');
    }
    if (!req.url || req.url === '') {
      req.url = '/';
    }
    await chatUIHandler(req, res);
    return;
  } catch (err: any) {
    const message = err?.message ?? String(err);
    res.status(500).send({ error: message });
  }
}).listen(PORT, () => {
  console.log(`MAS chat dev server listening on http://localhost:${PORT}`);
  console.log(`• UI:      http://localhost:${PORT}/api/chat-ui`);
  console.log(`• API:     http://localhost:${PORT}/api/chat`);
});
