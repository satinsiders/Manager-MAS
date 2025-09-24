import { createServer } from 'http';
import { parse } from 'url';
import chatHandler from '../apps/chat/index';
import chatUIHandler from '../apps/chat-ui/index';
import type { VercelRequest, VercelResponse } from '../packages/shared/vercel';

function decorateRequest(req: any, body: unknown): VercelRequest {
  const url = parse(req.url ?? '/', true);
  req.query = url.query as Record<string, string | string[]>;
  req.body = body;
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

const PORT = Number(process.env.PORT ?? process.env.MAS_CHAT_PORT ?? 4321);

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
