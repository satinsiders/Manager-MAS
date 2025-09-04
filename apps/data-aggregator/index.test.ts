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
    { student_id: 's1', question_type: 'math', score: 80, confidence_rating: 4, timestamp: '2024-01-01' },
  ];
  const dispatches = [
    { student_id: 's1', question_type: 'math', status: 'sent' },
    { student_id: 's1', question_type: 'reading', status: 'sent' },
  ];

  const students = await aggregateStudentStats(
    performances,
    dispatches,
    'ts',
    async () => 'chart-url'
  );

  const math = students.find((s) => s.student_id === 's1' && s.question_type === 'math');
  const reading = students.find((s) => s.student_id === 's1' && s.question_type === 'reading');
  assert.equal(math?.completion_rate, 1);
  assert.equal(reading?.completion_rate, 0);
  console.log('Accurate completion rates grouped by question type');
})();
