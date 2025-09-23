import { pathToFileURL } from 'url';
import { resolve } from 'path';
import type { VercelRequest, VercelResponse } from '../packages/shared/vercel';

type PayloadShape = {
  body?: unknown;
  query?: Record<string, string | string[]>;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
};

const [, , handlerPathArg, payloadArg] = process.argv;

if (!handlerPathArg) {
  console.error('Usage: npx tsx scripts/invoke.ts <handler-path> [payload-json]');
  process.exit(1);
}

const handlerPath = resolve(process.cwd(), handlerPathArg);
const payload: PayloadShape = payloadArg ? JSON.parse(payloadArg) : {};

const req: VercelRequest = {
  body: payload.body,
  query: payload.query ?? {},
  headers: payload.headers ?? {},
  cookies: payload.cookies,
  method: 'POST',
  url: handlerPath,
  socket: undefined as any,
} as any;

const res: VercelResponse = {
  status(code: number): VercelResponse {
    console.log('status', code);
    return this;
  },
  json(body: unknown): void {
    console.dir(body, { depth: 6, colors: true });
  },
  send(body: unknown): void {
    console.dir(body, { depth: 6, colors: true });
  },
  setHeader(name: string, value: number | string | readonly string[]): VercelResponse {
    console.log('header', name, value);
    return this;
  },
  getHeader(): number | string | string[] | undefined {
    return undefined;
  },
  removeHeader(): void {
    // noop
  },
  end(body?: unknown): void {
    if (body !== undefined) {
      console.dir(body, { depth: 6, colors: true });
    }
  },
} as any;

(async () => {
  try {
    const mod = await import(pathToFileURL(handlerPath).href);
    const handler = mod.default ?? mod.handler;
    if (typeof handler !== 'function') {
      throw new Error('Handler module must export a default function');
    }
    await handler(req, res);
  } catch (err) {
    console.error('Invoke failed');
    console.error(err);
    process.exitCode = 1;
  }
})();
