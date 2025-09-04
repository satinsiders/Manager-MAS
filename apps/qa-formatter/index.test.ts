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
process.env.STUDYPLAN_EDITOR_URL = 'http://example.com';
process.env.QA_FORMATTER_URL = 'http://example.com';
process.env.UPSTASH_REDIS_REST_URL = 'http://example.com';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
process.env.SUPERFASTSAT_API_URL = 'http://example.com';
process.env.ORCHESTRATOR_URL = 'http://example.com';
process.env.ORCHESTRATOR_SECRET = 'secret';
process.env.SCHEDULER_SECRET = 'sched-secret';

(async () => {
  // Stub network and database interactions used by notify
  const supabaseModule = await import('../../packages/shared/supabase');
  const supabase = supabaseModule.supabase as any;
  let draftStudyplan: any = null;
  supabase.from = (table: string) => {
    if (table === 'studyplan_drafts') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({ data: { studyplan: draftStudyplan } })
            })
          })
        }),
        delete: () => ({
          eq: () => ({
            eq: async () => ({})
          })
        })
      };
    }
    if (table === 'studyplans') {
      return { insert: async () => ({}) };
    }
    if (table === 'students') {
      return { update: () => ({ eq: async () => ({}) }) };
    }
    return {};
  };

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

  const baseStudyplan = {
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
  const dupStudyplan = JSON.parse(JSON.stringify(baseStudyplan));
  dupStudyplan.lessons[0].units[1].id = dupStudyplan.lessons[0].units[0].id;
  draftStudyplan = dupStudyplan;
  const res1 = createRes();
  await handler(
    {
      body: {
        student_id: baseStudyplan.student_id,
        version: baseStudyplan.version,
        qa_user: 'tester'
      }
    } as any,
    res1 as any
  );
  assert.equal(res1.statusCode, 400);
  assert.deepEqual(res1.body, { error: 'invalid studyplan' });

  // Missing duration_minutes should also trigger validation error
  const missingStudyplan = JSON.parse(JSON.stringify(baseStudyplan));
  delete (missingStudyplan.lessons[0].units[1] as any).duration_minutes;
  draftStudyplan = missingStudyplan;
  const res2 = createRes();
  await handler(
    {
      body: {
        student_id: baseStudyplan.student_id,
        version: baseStudyplan.version,
        qa_user: 'tester'
      }
    } as any,
    res2 as any
  );
  assert.equal(res2.statusCode, 400);
  assert.deepEqual(res2.body, { error: 'invalid studyplan' });
  supabase.from = () => ({ insert: async () => ({}), update: async () => ({}) });
})();
