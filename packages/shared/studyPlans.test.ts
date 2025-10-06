import assert from 'node:assert/strict';

process.env.OPENAI_API_KEY = 'test-key';
process.env.SUPABASE_URL = 'http://example.com';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
process.env.NOTIFICATION_BOT_URL = 'http://example.com/notify';
process.env.SUPERFASTSAT_API_URL = 'http://example.com/platform';
process.env.SUPERFASTSAT_API_TOKEN = 'token';

(async () => {
  const mod = await import('./studyPlans');
  const { nextStudyPlanVersion, __test__ } = mod as typeof import('./studyPlans');
  const { normalizeStudyPlanPayload } = __test__;

  assert.equal(nextStudyPlanVersion([], []), 1);
  assert.equal(nextStudyPlanVersion([1, 2, 3], []), 4);
  assert.equal(nextStudyPlanVersion([1, 5], [2, 6]), 7);

  const normalized = normalizeStudyPlanPayload(
    {
      notes: 'Focus on algebra fundamentals',
      curricula: [
        {
          id: 'algebra-guidance',
          minutes_recommended: 30,
          units: [
            { id: 'unit-1', title: 'Warmup', duration_minutes: 15 },
            { id: 'unit-2', title: 'Drill Set', duration_minutes: 15 },
          ],
        },
      ],
    },
    'student-123',
    4,
  );

  assert.equal(normalized.student_id, 'student-123');
  assert.equal(normalized.version, 4);
  assert(Array.isArray(normalized.curricula));
  assert.equal(normalized.curricula?.[0]?.units?.length, 2);
  assert.equal(normalized.curricula?.[0]?.units?.[0]?.id, 'unit-1');

  assert.throws(
    () =>
      normalizeStudyPlanPayload(
        {
          curricula: [
            {
              id: '',
              units: [{ id: 'missing-duration' }],
            },
          ],
        },
        'student-xyz',
        2,
      ),
    /String must contain at least 1 character|String must contain at least 1 character/,
  );

  assert.throws(
    () =>
      normalizeStudyPlanPayload(
        {
          curricula: [
            {
              id: 'reading',
              units: [
                {
                  id: 'unit-negative',
                  duration_minutes: -5,
                },
              ],
            },
          ],
        },
        'student-xyz',
        3,
      ),
    /Number must be greater than or equal to 0/,
  );

  console.log('studyPlans helpers validate payloads and version math');
})();
