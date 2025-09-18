import assert from 'node:assert/strict';
import http from 'node:http';

// Provide required env variables before importing modules
process.env.OPENAI_API_KEY = 'test';
process.env.SUPABASE_URL = 'http://example.com';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'key';
process.env.NOTIFICATION_BOT_URL = 'http://example.com';
process.env.LESSON_PICKER_URL = 'http://example.com';
process.env.DISPATCHER_URL = 'http://example.com';
process.env.ASSIGNMENTS_URL = 'http://example.com';
process.env.DATA_AGGREGATOR_URL = 'http://example.com';
process.env.CURRICULUM_EDITOR_URL = 'http://example.com';
process.env.QA_FORMATTER_URL = 'http://example.com';
process.env.SUPERFASTSAT_API_URL = 'http://example.com';
process.env.SUPERFASTSAT_API_TOKEN = 'token';
process.env.ORCHESTRATOR_URL = 'http://example.com';
process.env.ORCHESTRATOR_SECRET = 'secret';
process.env.SCHEDULER_SECRET = 'sched-secret';

(async () => {
  let nextStatus = 500;
  const server = http.createServer((_req, res) => {
    res.writeHead(nextStatus, { 'Content-Type': 'application/json' });
    res.end('{}');
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  process.env.SLACK_WEBHOOK_URL = `http://localhost:${port}/slack`;

  const supabaseModule = await import('../../packages/shared/supabase');
  const supabase = supabaseModule.supabase as any;
  supabase.from = () => ({ insert: async () => ({}) });

  const handler = (await import('./index')).default;

  function createRes() {
    return {
      statusCode: 0,
      body: undefined as any,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: any) {
        this.body = payload;
      },
    };
  }

  // failure path
  nextStatus = 500;
  const resFail = createRes();
  await handler({ body: { text: 'hi' } } as any, resFail as any);
  assert.equal(resFail.statusCode, 500);
  assert.deepEqual(resFail.body, { error: 'notify failed' });

  // success path
  nextStatus = 200;
  const resOk = createRes();
  await handler({ body: { text: 'hi' } } as any, resOk as any);
  assert.equal(resOk.statusCode, 200);
  assert.deepEqual(resOk.body, { sent: true });

  server.close();
  console.log('Notification bot tests passed');
})();
