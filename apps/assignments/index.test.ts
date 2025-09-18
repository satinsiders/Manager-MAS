import assert from 'node:assert/strict';

process.env.SLACK_WEBHOOK_URL = 'http://example.com';
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
  const { supabase } = await import('../../packages/shared/supabase');
  const inserted: any[] = [];

  (supabase as any).from = (table: string) => {
    assert.equal(table, 'assignments');
    return {
      insert(payload: any) {
        inserted.push(payload);
        return {
          select: () => ({
            single: async () => ({ data: { id: payload.id } }),
          }),
        };
      },
    };
  };

  const { default: handler } = await import('./index');
  let statusCode = 0;
  let jsonBody: any = null;
  const res: any = {
    status(code: number) {
      statusCode = code;
      return {
        json(body: any) {
          jsonBody = body;
        },
      };
    },
  };

  await handler(
    {
      body: {
        student_id: 's1',
        study_plan_version: 2,
        minutes: 12,
        units: [{ id: 'u1', duration_minutes: 6 }],
      },
    } as any,
    res,
  );

  assert.equal(statusCode, 200);
  assert.ok(jsonBody.assignment_id);
  assert.equal(inserted[0].student_id, 's1');
  assert.equal(inserted[0].duration_minutes, 12);
  console.log('Assignments agent creates records');
})();
