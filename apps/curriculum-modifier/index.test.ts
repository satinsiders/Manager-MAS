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
  const { fetchLatestSummary } = await import('./index');
  const { supabase } = await import('../../packages/shared/supabase');
  const { LATEST_SUMMARY_PATH } = await import('../../packages/shared/summary');

  let requestedPath = '';
  (supabase as any).storage = {
    from: () => ({
      download: async (path: string) => {
        requestedPath = path;
        return {
          data: {
            text: async () =>
              JSON.stringify({
                students: [
                  { student_id: '1', avg: 1 },
                  { student_id: '2', avg: 2 },
                ],
              }),
          },
        } as any;
      },
    }),
  } as any;

  const summaries = await fetchLatestSummary();
  assert.equal(requestedPath, LATEST_SUMMARY_PATH);
  assert.equal(Array.isArray(summaries), true);
  assert.equal(summaries.length, 2);
  assert.equal(summaries[0].summary.student_id, '1');
  assert.equal(summaries[1].summary.student_id, '2');
})();
