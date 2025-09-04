import assert from 'node:assert/strict';

// Set required environment variables before importing the handler
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
process.env.SUPERFASTSAT_API_URL = 'http://example.com';
process.env.UPSTASH_REDIS_REST_URL = 'http://example.com';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.ORCHESTRATOR_URL = 'http://orchestrator.test';
process.env.ORCHESTRATOR_SECRET = 'orch-secret';
process.env.SCHEDULER_SECRET = 'sched-secret';
process.env.TEACHER_API_KEY = 'key';
process.env.TEACHER_ID = 'teacher';

(async () => {
  const { default: handler } = await import('./index');

  // missing secret
  const reqMissing = { query: { run_type: 'daily' }, headers: {} } as any;
  let statusMissing = 0;
  let bodyMissing: any = null;
  const resMissing: any = {
    status(code: number) {
      statusMissing = code;
      return { json(obj: any) { bodyMissing = obj; } };
    }
  };
  await handler(reqMissing, resMissing);
  assert.equal(statusMissing, 401);
  assert.equal(bodyMissing.error, 'unauthorized');

  // invalid run_type
  const reqInvalid = {
    query: { run_type: 'yearly' },
    headers: { authorization: `Bearer ${process.env.SCHEDULER_SECRET}` }
  } as any;
  let statusInvalid = 0;
  let bodyInvalid: any = null;
  const resInvalid: any = {
    status(code: number) {
      statusInvalid = code;
      return { json(obj: any) { bodyInvalid = obj; } };
    }
  };
  await handler(reqInvalid, resInvalid);
  assert.equal(statusInvalid, 400);
  assert.equal(bodyInvalid.error, 'invalid run_type');

  // successful daily and weekly runs should call orchestrator with correct headers
  const originalFetch = globalThis.fetch;
  for (const runType of ['daily', 'weekly']) {
    let calledUrl: string | null = null;
    let authHeader: string | null = null;
    (globalThis as any).fetch = async (url: string, opts: any) => {
      calledUrl = url;
      authHeader = opts.headers.Authorization;
      return { ok: true } as any;
    };
    const req = {
      query: { run_type: runType },
      headers: { authorization: `Bearer ${process.env.SCHEDULER_SECRET}` }
    } as any;
    let status = 0;
    const res: any = {
      status(code: number) {
        status = code;
        return { json() {} };
      }
    };
    await handler(req, res);
    assert.equal(status, 200);
    assert.equal(
      calledUrl,
      `${process.env.ORCHESTRATOR_URL}?run_type=${runType}`
    );
    assert.equal(authHeader, `Bearer ${process.env.ORCHESTRATOR_SECRET}`);
  }
  globalThis.fetch = originalFetch;

  console.log('Scheduler authorization and fetch tests passed');
})();
