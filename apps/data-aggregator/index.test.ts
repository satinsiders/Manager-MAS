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

(async () => {
  const { aggregateStudentStats } = await import('./index');

  const performances = [
    { student_id: 's1', score: 80, confidence_rating: 4, timestamp: '2024-01-01' },
  ];
  const dispatches = [
    { student_id: 's1', status: 'sent' },
    { student_id: 's1', status: 'failed' },
    { student_id: 's2', status: 'failed' },
  ];

  const students = await aggregateStudentStats(
    performances,
    dispatches,
    'ts',
    async () => 'chart-url'
  );

  const s1 = students.find((s) => s.student_id === 's1');
  const s2 = students.find((s) => s.student_id === 's2');
  assert.equal(s1?.completion_rate, 1);
  assert.equal(s2, undefined);
  console.log('Accurate completion rates with mixed dispatch statuses');
})();
