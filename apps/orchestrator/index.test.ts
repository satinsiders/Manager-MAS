import assert from 'node:assert/strict';
import http from 'node:http';

// Provide required env variables before importing modules
process.env.SLACK_WEBHOOK_URL = 'http://localhost';
process.env.OPENAI_API_KEY = 'test';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'key';
process.env.UPSTASH_REDIS_REST_URL = 'http://localhost';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';

(async () => {
  // start mock server
  let dispatcherBody: any = null;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      if (req.url === '/lesson-picker') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({ lesson_id: 'l1', assignment_id: 'a1', log_id: 'log1' })
        );
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
  process.env.CURRICULUM_MODIFIER_URL = `${base}/mod`;
  process.env.QA_FORMATTER_URL = `${base}/qa`;

  const { default: handler } = await import('./index');
  const { supabase } = await import('../../packages/shared/supabase');

  (supabase as any).from = (table: string) => {
    if (table === 'students') {
      return {
        select: () => ({ eq: () => ({ data: [{ id: 1 }] }) })
      };
    }
    return {
      insert: async () => ({})
    };
  };

  const req = { query: { run_type: 'daily' } } as any;
  const res: any = {
    status(_code: number) {
      return { json() {} };
    }
  };

  await handler(req, res);
  server.close();

  assert.equal(dispatcherBody.log_id, 'log1');
  console.log('Orchestrator passed log_id');
})();

