import assert from 'node:assert/strict';

// Ensure config schema validation passes before importing tested module
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
  const mod = await import('./index');
  const { parseTitleToTaxonomy, mapStudentCurriculums, evaluateQuestionTypeProgress, computeProgressRows } = mod;

  const parsed = parseTitleToTaxonomy('[Information & Ideas] > Inferences - Practice (Medium)');
  assert(parsed);
  assert.equal(parsed?.domain, 'information & ideas');
  assert.equal(parsed?.category, 'general');
  assert.equal(parsed?.specific_type, 'inferences');
  assert.equal(parsed?.canonical_path, 'information & ideas > general > inferences');
  assert.equal(parsed?.subtype, 'practice_medium');

  const rows = mapStudentCurriculums(
    [
      {
        id: 111,
        curriculumId: 222,
        title: '[Information & Ideas] > Inferences - Practice (Medium)',
        totalDuration: 120,
        remainingDuration: 45,
        createdAt: '2024-01-01T00:00:00.000Z',
        stoppedAt: null,
      },
    ],
    'student-1'
  );

  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.student_id, 'student-1');
  assert.equal(row.external_curriculum_id, '222');
  assert.equal(row.student_curriculum_id, '111');
  assert.equal(row.raw_title, '[Information & Ideas] > Inferences - Practice (Medium)');
  assert.equal(row.total_minutes, 120);
  assert.equal(row.remaining_minutes, 45);
  assert.equal(row.first_dispatched_at, '2024-01-01T00:00:00.000Z');
  assert.equal(row.last_dispatched_at, null);

  const evaluation = evaluateQuestionTypeProgress(
    [
      { score: 95, confidence_rating: 0.92, timestamp: '2024-01-01T00:00:00.000Z' },
      { score: 96, confidence_rating: 0.9, timestamp: '2024-01-02T00:00:00.000Z' },
      { score: 94, confidence_rating: 0.88, timestamp: '2024-01-03T00:00:00.000Z' },
      { score: 97, confidence_rating: 0.94, timestamp: '2024-01-04T00:00:00.000Z' },
      { score: 93, confidence_rating: 0.86, timestamp: '2024-01-05T00:00:00.000Z' },
      { score: 99, confidence_rating: 0.95, timestamp: '2024-01-06T00:00:00.000Z' },
    ],
    new Date('2024-01-10T00:00:00.000Z'),
    14
  );
  assert.equal(evaluation.status, 'mastered');
  assert.equal(evaluation.evidence_window.sample_size, 6);
  assert(evaluation.rolling_metrics.average_confidence && evaluation.rolling_metrics.average_confidence >= 0.85);

  const progressRows = computeProgressRows(
    'student-1',
    'plan-1',
    [
      { question_type: 'Algebra', score: 88, confidence_rating: 0.8, timestamp: '2024-01-01T00:00:00.000Z' },
      { question_type: 'Algebra', score: 90, confidence_rating: 0.82, timestamp: '2024-01-02T00:00:00.000Z' },
      { question_type: 'Algebra', score: 92, confidence_rating: 0.83, timestamp: '2024-01-03T00:00:00.000Z' },
      { question_type: 'Geometry', score: 60, confidence_rating: 0.6, timestamp: '2024-01-01T00:00:00.000Z' },
      { question_type: 'Geometry', score: 65, confidence_rating: 0.55, timestamp: '2024-01-04T00:00:00.000Z' },
    ],
    14,
    new Date('2024-01-10T00:00:00.000Z')
  );
  const algebra = progressRows.find((r) => r.question_type === 'algebra');
  const geometry = progressRows.find((r) => r.question_type === 'geometry');
  assert(algebra);
  assert.equal(algebra?.status, 'near_mastery');
  assert(geometry);
  assert.equal(geometry?.status, 'in_progress');

  console.log('Progress evaluation covers mastery thresholds');

  console.log('platform-sync helpers parse curriculum titles and mirror dispatch data');
})();
