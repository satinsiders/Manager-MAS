import type { VercelResponse } from '../../../packages/shared/vercel';
import type { StreamEvent } from './types';

export function createNdjsonWriter(res: VercelResponse) {
  let started = false;
  let closed = false;

  function ensureStarted() {
    if (started) return;
    started = true;
    if (typeof res.status === 'function') {
      res.status(200);
    } else {
      res.statusCode = 200;
    }
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    (res as any).flushHeaders?.();
  }

  return {
    write(event: StreamEvent) {
      if (closed) return;
      ensureStarted();
      res.write(`${JSON.stringify(event)}\n`);
    },
    error(messageOrPayload: string | { message?: string; stack?: string; details?: unknown }) {
      if (closed) return;
      ensureStarted();
      if (typeof messageOrPayload === 'string') {
        res.write(`${JSON.stringify({ type: 'error', message: messageOrPayload })}\n`);
      } else {
        res.write(`${JSON.stringify({ type: 'error', error: messageOrPayload })}\n`);
      }
      closed = true;
      if (!res.writableEnded) {
        res.end();
      }
    },
    close() {
      if (closed) return;
      closed = true;
      if (!res.writableEnded) {
        res.end();
      }
    },
  };
}
