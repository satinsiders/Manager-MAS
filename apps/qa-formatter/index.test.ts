import assert from 'node:assert/strict';

// Provide required env variables before importing modules
process.env.SLACK_WEBHOOK_URL = 'http://example.com';
process.env.OPENAI_API_KEY = 'test';
process.env.SUPABASE_URL = 'http://example.com';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'key';
process.env.NOTIFICATION_BOT_URL = 'http://example.com';
process.env.LESSON_PICKER_URL = 'http://example.com';
process.env.DISPATCHER_URL = 'http://example.com';
process.env.DATA_AGGREGATOR_URL = 'http://example.com';
process.env.CURRICULUM_MODIFIER_URL = 'http://example.com';
process.env.QA_FORMATTER_URL = 'http://example.com';

(async () => {
  // Stub network and database interactions used by notify
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

  const baseCurriculum = {
    version: 1,
    student_id: '123e4567-e89b-12d3-a456-426614174000',
    notes: 'some notes',
    lessons: [
      {
        id: '11111111-1111-1111-1111-111111111111',
        units: [
          { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', duration_minutes: 5 },
          { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', duration_minutes: 10 },
        ],
      },
    ],
  };

  // Duplicate unit IDs should trigger validation error
  const dupCurriculum = JSON.parse(JSON.stringify(baseCurriculum));
  dupCurriculum.lessons[0].units[1].id = dupCurriculum.lessons[0].units[0].id;
  const res1 = createRes();
  await handler({ body: { curriculum: dupCurriculum, qa_user: 'tester' } } as any, res1 as any);
  assert.equal(res1.statusCode, 400);
  assert.deepEqual(res1.body, { error: 'invalid curriculum' });

  // Missing duration_minutes should also trigger validation error
  const missingCurriculum = JSON.parse(JSON.stringify(baseCurriculum));
  delete (missingCurriculum.lessons[0].units[1] as any).duration_minutes;
  const res2 = createRes();
  await handler({ body: { curriculum: missingCurriculum, qa_user: 'tester' } } as any, res2 as any);
  assert.equal(res2.statusCode, 400);
  assert.deepEqual(res2.body, { error: 'invalid curriculum' });
})();
