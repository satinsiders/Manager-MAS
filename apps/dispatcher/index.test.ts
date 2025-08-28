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
  const { default: handler } = await import('./index');
  const { supabase } = await import('../../packages/shared/supabase');

  let updated: any = null;
  (supabase as any).from = (table: string) => {
    if (table === 'dispatch_log') {
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: { id: 'log1', lesson_id: 'lesson1' } }) })
        }),
        update: (fields: any) => ({
          eq: (_col: string, id: string) => {
            updated = { id, ...fields };
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
    return {} as any;
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
  assert.equal(updated.id, 'log1');
  assert.equal(updated.status, 'sent');
  assert.ok(updated.sent_at);

  // failure path
  updated = null;
  fetchCalled = false;
  (globalThis as any).fetch = async () => {
    fetchCalled = true;
    return { ok: false } as any;
  };

  await handler(req, res);
  assert.equal(fetchCalled, true);
  assert.equal(updated.status, 'failed');

  console.log('Dispatcher used log_id');
})();

