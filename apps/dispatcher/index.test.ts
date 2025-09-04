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
process.env.ORCHESTRATOR_URL = 'http://example.com';
process.env.ORCHESTRATOR_SECRET = 'secret';
process.env.SCHEDULER_SECRET = 'sched-secret';
process.env.TEACHER_API_KEY = 'teacher-key';
process.env.TEACHER_ID = 'teacher1';

// Run tests in async IIFE to allow dynamic imports after env setup
(async () => {
  const { selectUnits, default: handler } = await import('./index');
  const { supabase } = await import('../../packages/shared/supabase');

  const curriculum = {
    lessons: [
      { id: 'l1', units: [{ id: 'u1', duration_minutes: 3 }, { id: 'u2', duration_minutes: 3 }] },
      { id: 'l2', units: [{ id: 'u3', duration_minutes: 4 }] },
    ],
  };

  const exact = await selectUnits(curriculum, 7);
  assert.deepEqual(
    exact.units.map((u: any) => u.id),
    ['u1', 'u3']
  );
  assert.equal(exact.total, 7);

  const under = await selectUnits(curriculum, 5);
  assert.deepEqual(under.units.map((u: any) => u.id), ['u3']);
  assert.equal(under.total, 4);

  const over = await selectUnits(curriculum, 2);
  assert.deepEqual(over.units.map((u: any) => u.id), ['u1']);
  assert.equal(over.total, 3);

  // Mock fetch to capture Authorization header
  let authHeader: string | undefined;
  (global as any).fetch = async (_url: string, opts: any) => {
    authHeader = opts.headers.Authorization;
    return { ok: true, status: 200, json: async () => ({}) } as any;
  };

  // Mock supabase interactions
  let assignment: any = { visible: false };
  let updateCalled = false;
  (supabase as any).from = (table: string) => {
    if (table === 'assigned_curricula') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({ data: assignment }),
              }),
            }),
          }),
        }),
        update: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => {
                updateCalled = true;
                return Promise.resolve({});
              },
            }),
          }),
        }),
      };
    }
    if (table === 'dispatch_log') {
      return {
        insert: () => ({ select: () => ({ single: async () => ({ data: { id: 1 } }) }) }),
      };
    }
    if (table === 'students') {
      return { update: () => ({ eq: () => Promise.resolve({}) }) };
    }
    return {} as any;
  };

  const req: any = {
    body: {
      student_id: 's1',
      curriculum_id: 'c1',
      units: [{ id: 'u1', duration_minutes: 5, lesson_id: 'l1' }],
    },
  };
  let status = 0;
  const res: any = {
    status(code: number) {
      status = code;
      return { json() {} };
    },
  };

  // Successful dispatch
  await handler(req, res);
  assert.equal(status, 200);
  assert.equal(authHeader, `Bearer ${process.env.TEACHER_API_KEY}`);
  assert.equal(updateCalled, true);

  // Assignment missing
  assignment = null;
  updateCalled = false;
  authHeader = undefined;
  status = 0;
  await handler(req, res);
  assert.equal(status, 404);
  assert.equal(updateCalled, false);
  assert.equal(authHeader, undefined);

  console.log('dispatcher tests passed');
})();

