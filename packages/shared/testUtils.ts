import type { VercelRequest, VercelResponse } from './vercel';

type MockRes = VercelResponse & {
  statusCode: number;
  body: any;
  headers: Record<string, string>;
};

export function createMockRes(): MockRes {
  const res: Partial<MockRes> = {
    statusCode: 200,
    body: undefined,
    headers: {},
  };
  res.setHeader = (key: string, value: string) => {
    res.headers![key.toLowerCase()] = value;
    return res as MockRes;
  };
  res.status = (code: number) => {
    res.statusCode = code;
    return res as MockRes;
  };
  res.json = (payload: unknown) => {
    res.body = payload;
  };
  res.send = (payload: unknown) => {
    res.body = payload;
  };
  return res as MockRes;
}

export function createMockReq(
  overrides: Partial<VercelRequest> & { method?: string } = {},
): VercelRequest {
  const req: Partial<VercelRequest> = {
    method: overrides.method ?? 'GET',
    query: overrides.query ?? {},
    body: overrides.body,
    headers: overrides.headers ?? {},
    socket: overrides.socket as any,
    url: overrides.url ?? '/',
  };
  return req as VercelRequest;
}

export function getResponsePayload(res: MockRes) {
  return res.body;
}

export type { MockRes };
