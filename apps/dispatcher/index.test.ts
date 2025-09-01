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

// Run tests in async IIFE to allow dynamic imports after env setup
(async () => {
  const { selectUnits } = await import('./index');

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

  console.log('selectUnits combination tests passed');
})();

