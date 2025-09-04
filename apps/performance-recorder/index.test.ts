import assert from 'assert';

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
process.env.TEACHER_API_KEY = 'key';
process.env.TEACHER_ID = 'teacher';

class MockRedis {
  public lastExpire: [string, number] | null = null;
  async lpush(_key: string, _value: number) {}
  async ltrim(_key: string, _start: number, _end: number) {}
  async expire(key: string, ttl: number) {
    this.lastExpire = [key, ttl];
  }
}

(async () => {
  const { default: handler, LAST_SCORES_TTL } = await import('./index');
  const { supabase } = await import('../../packages/shared/supabase');

  let inserted: any = null;
  (supabase as any).from = (_table: string) => ({
    insert(fields: any) {
      inserted = fields;
      return { select: () => ({ single: async () => ({ data: { id: '1' } }) }) };
    },
  });

  const mockRedis = new MockRedis();

  const req = {
    body: { student_id: 's1', lesson_id: 'l1', score: 80, confidence_rating: 0.9 },
  } as any;
  const res: any = { status() { return { json() {} }; } };

  await handler(req, res, mockRedis as any);

  assert.deepStrictEqual(inserted, {
    student_id: 's1',
    lesson_id: 'l1',
    score: 80,
    confidence_rating: 0.9,
  });
  assert.deepStrictEqual(mockRedis.lastExpire, [
    'last_3_scores:s1',
    LAST_SCORES_TTL,
  ]);

  console.log('Performance recorded and TTL set');
})();
