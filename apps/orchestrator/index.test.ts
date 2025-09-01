import assert from 'node:assert/strict';
import http from 'node:http';

// Provide required env variables before importing modules
process.env.SLACK_WEBHOOK_URL = 'http://localhost';
process.env.OPENAI_API_KEY = 'test';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'key';
process.env.UPSTASH_REDIS_REST_URL = 'http://localhost';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.ORCHESTRATOR_SECRET = 'secret';

(async () => {
  // start mock server
  let dispatcherBody: any = null;
  let lessonPickerBody: any = null;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      if (req.url === '/lesson-picker') {
        lessonPickerBody = body ? JSON.parse(body) : null;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ minutes: 5 }));
      } else if (req.url === '/dispatcher') {
        dispatcherBody = body ? JSON.parse(body) : null;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const base = `http://localhost:${port}`;

  // set URLs dependent on server
  process.env.LESSON_PICKER_URL = `${base}/lesson-picker`;
  process.env.DISPATCHER_URL = `${base}/dispatcher`;
  process.env.NOTIFICATION_BOT_URL = `${base}/notify`;
  process.env.DATA_AGGREGATOR_URL = `${base}/agg`;
  process.env.CURRICULUM_EDITOR_URL = `${base}/mod`;
  process.env.QA_FORMATTER_URL = `${base}/qa`;

    class MockRedis {
      store: Record<string, any> = {};
      async set(key: string, value: string) {
        this.store[key] = value;
      }
      async get(key: string) {
        return this.store[key] ?? null;
      }
    }

    const memory = await import('../../packages/shared/memory');
    memory.setMemoryClient(new MockRedis());

    const { default: handler } = await import('./index');
    const { supabase } = await import('../../packages/shared/supabase');

  (supabase as any).from = (table: string) => {
    if (table === 'students') {
      return {
        select: () => ({ eq: () => ({ data: [{ id: 1, current_curriculum_version: 2 }] }) })
      };
    }
    return {
      insert: async () => ({})
    };
  };

  // unauthorized request
  const reqUnauthorized = { query: { run_type: 'daily' }, headers: {} } as any;
  let unauthorizedStatus = 0;
  const resUnauthorized: any = {
    status(code: number) {
      unauthorizedStatus = code;
      return { json() {} };
    }
  };
  await handler(reqUnauthorized, resUnauthorized);
  assert.equal(unauthorizedStatus, 401);

  // authorized request
  dispatcherBody = null;
  const req = {
    query: { run_type: 'daily' },
    headers: { authorization: `Bearer ${process.env.ORCHESTRATOR_SECRET}` }
  } as any;
  const res: any = {
    status(_code: number) {
      return { json() {} };
    }
  };

  await handler(req, res);
  server.close();

  assert.equal(dispatcherBody.student_id, 1);
  assert.equal(dispatcherBody.minutes, 5);
  assert.equal(lessonPickerBody.curriculum_version, 2);
  console.log('Orchestrator authorization tests passed');
})();

