import type { IncomingMessage, ServerResponse } from 'http';

/**
 * Minimal request/response types needed by our handlers.
 * Keeps us decoupled from the heavy @vercel/node runtime package.
 */
export interface VercelRequest extends IncomingMessage {
  body?: unknown;
  query: Record<string, string | string[]>;
  cookies?: Record<string, string>;
}

export interface VercelResponse extends ServerResponse {
  status(statusCode: number): this;
  json(body: unknown): void;
  send(body: unknown): void;
}
