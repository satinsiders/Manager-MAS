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

  let inserted: any = null;
  let studentUpdated: any = null;

  const curriculum = {
    lessons: [
      { id: 'l1', units: [{ id: 'u1', duration_minutes: 3 }, { id: 'u2', duration_minutes: 3 }] },
      { id: 'l2', units: [{ id: 'u3', duration_minutes: 4 }] }
    ]
  };

  (supabase as any).from = (table: string) => {
    if (table === 'students') {
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: { current_curriculum_version: 1 } }) }) }),
        update: (fields: any) => ({
          eq: () => {
            studentUpdated = fields;
            return Promise.resolve({});
          }
        })
      };
    }
    if (table === 'curricula') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ single: async () => ({ data: { curriculum } }) })
          })
        })
      };
    }
    if (table === 'dispatch_log') {
      return {
        insert: (fields: any) => {
          inserted = fields;
          return { select: () => ({ single: async () => ({ data: { id: 'log1' } }) }) };
        }
      };
    }
    return {} as any;
  };

  let fetchBody: any = null;
  (globalThis as any).fetch = async (_url: string, opts: any) => {
    fetchBody = JSON.parse(opts.body);
    return { ok: true } as any;
  };

  const req = { body: { student_id: 's1', minutes: 5, next_lesson_id: 'next1' } } as any;
  const res: any = { status() { return { json() {} }; } };

  await handler(req, res);

  assert.deepEqual(fetchBody.units.map((u: any) => u.id), ['u1', 'u2']);
  assert.equal(inserted.minutes, 6);
  assert.deepEqual(inserted.unit_ids, ['u1', 'u2']);
  assert.equal(inserted.requested_lesson_id, 'next1');
  assert.equal(inserted.lesson_id, 'l1');
  assert.ok(studentUpdated.last_lesson_sent);
  assert.equal(studentUpdated.last_lesson_id, 'l1');

  console.log('Dispatcher unit selection tests passed');
})();

