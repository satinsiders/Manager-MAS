import assert from 'assert';

// Set env variables before importing modules
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
  const { default: handler } = await import('./index');
  const { supabase } = await import('../../packages/shared/supabase');

  const store: any = {
    performances: null,
    student_recent_scores: null,
  };

  (supabase as any).from = (table: string) => {
    if (table === 'question_types') {
      return {
        select: async () => ({ data: [] }),
      };
    }
    if (table === 'performances') {
      return {
        insert(fields: any) {
          store.performances = fields;
          return {
            select: () => ({
              single: async () => ({ data: { id: '1' } }),
            }),
          };
        },
      };
    }
    if (table === 'student_recent_scores') {
      return {
        select() {
          const chain: any = {
            filter: null,
            eq(_col: string, val: string) {
              this.filter = val;
              return this;
            },
            maybeSingle: async () => ({
              data:
                store.student_recent_scores &&
                store.student_recent_scores.student_id === chain.filter
                  ? store.student_recent_scores
                  : null,
            }),
          };
          return chain;
        },
        upsert(payload: any) {
          store.student_recent_scores = payload;
          return Promise.resolve({ data: payload });
        },
      };
    }
    throw new Error(`Unexpected table ${table}`);
  };

  const req = {
    body: {
      student_id: 's1',
      lesson_id: 'l1',
      score: 80,
      confidence_rating: 0.9,
      study_plan_id: 'sp1',
      platform_curriculum_id: 'ext-cur-123',
      question_type: 'math',
      question_type_id: undefined,
    },
  } as any;
  const res: any = { status() { return { json() {} }; } };

  await handler(req, res);

  assert.deepStrictEqual(store.performances, {
    student_id: 's1',
    lesson_id: 'l1',
    score: 80,
    confidence_rating: 0.9,
    study_plan_id: 'sp1',
    platform_curriculum_id: 'ext-cur-123',
    question_type: 'math',
    question_type_id: null,
  });
  assert.deepStrictEqual(store.student_recent_scores?.scores, [80]);
  assert.equal(store.student_recent_scores?.student_id, 's1');

  console.log('Performance recorded and TTL set');
})();
