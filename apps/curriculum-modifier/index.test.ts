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
process.env.UPSTASH_REDIS_REST_URL = 'http://example.com';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';

(async () => {
  const { fetchLatestSummary } = await import('./index');
  const { supabase } = await import('../../packages/shared/supabase');
  const { LATEST_SUMMARY_PATH } = await import('../../packages/shared/summary');

  let requestedPath = '';
  (supabase as any).storage = {
    from: () => ({
      download: async (path: string) => {
        requestedPath = path;
        return { text: async () => '{}' } as any;
      },
    }),
  } as any;

  await fetchLatestSummary();
  assert.equal(requestedPath, LATEST_SUMMARY_PATH);
})();
