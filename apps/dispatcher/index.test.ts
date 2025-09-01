import assert from 'node:assert/strict';

// Set env variables before importing modules
process.env.SLACK_WEBHOOK_URL = 'http://example.com';
process.env.OPENAI_API_KEY = 'test';
process.env.SUPABASE_URL = 'http://example.com';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'key';
process.env.NOTIFICATION_BOT_URL = 'http://example.com';
process.env.LESSON_PICKER_URL = 'http://example.com';
process.env.DISPATCHER_URL = 'http://example.com';
process.env.DATA_AGGREGATOR_URL = 'http://example.com';
process.env.CURRICULUM_EDITOR_URL = 'http://example.com';
process.env.QA_FORMATTER_URL = 'http://example.com';
process.env.UPSTASH_REDIS_REST_URL = 'http://example.com';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.SUPERFASTSAT_API_URL = 'http://example.com';

(async () => {
  const http = await import('node:http');
  let notifyCalls: string[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      if (req.url === '/notify') {
        notifyCalls.push(JSON.parse(body).text);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  process.env.NOTIFICATION_BOT_URL = `http://localhost:${port}/notify`;

  const { default: handler } = await import('./index');
  const { supabase } = await import('../../packages/shared/supabase');

  let dispatchUpdated: any = null;
  let studentUpdated: any = null;
  (supabase as any).from = (table: string) => {
    if (table === 'dispatch_log') {
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: { id: 'log1', lesson_id: 'lesson1', student_id: 'student1' } }) })
        }),
        update: (fields: any) => ({
          eq: (_col: string, id: string) => {
            dispatchUpdated = { id, ...fields };
            return Promise.resolve({});
          }
        })
      };
    }
    if (table === 'lessons') {
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'lesson1' } }) }) })
      };
    }
    if (table === 'students') {
      return {
        update: (fields: any) => ({
          eq: (_col: string, id: string) => {
            studentUpdated = { id, ...fields };
            return Promise.resolve({});
          }
        })
      };
    }
    return { insert: async () => ({}) } as any;
  };

  let fetchCalled = false;
  (globalThis as any).fetch = async (_url: string, _opts: any) => {
    fetchCalled = true;
    return { ok: true } as any;
  };

  const req = { body: { log_id: 'log1' } } as any;
  const res: any = { status() { return { json() {} }; } };

  await handler(req, res);

  assert.equal(fetchCalled, true);
  assert.equal(dispatchUpdated.id, 'log1');
  assert.equal(dispatchUpdated.status, 'sent');
  assert.ok(dispatchUpdated.sent_at);
  assert.equal(studentUpdated.id, 'student1');
  assert.ok(studentUpdated.last_lesson_sent);
  assert.equal(studentUpdated.last_lesson_id, 'lesson1');
  assert.deepEqual(notifyCalls, ['Dispatcher run succeeded']);

  // failure path
  dispatchUpdated = null;
  studentUpdated = null;
  fetchCalled = false;
  (globalThis as any).fetch = async () => {
    fetchCalled = true;
    return { ok: false } as any;
  };

  await handler(req, res);
  assert.equal(fetchCalled, true);
  assert.equal(dispatchUpdated.status, 'failed');
  assert.deepEqual(notifyCalls, [
    'Dispatcher run succeeded',
    'Dispatcher run failed: SuperfastSAT API responded undefined',
  ]);

  server.close();

  console.log('Dispatcher used log_id');
})();

