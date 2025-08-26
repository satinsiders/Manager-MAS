import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'http://example.com';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'key';
process.env.SLACK_WEBHOOK_URL = 'http://example.com';
process.env.OPENAI_API_KEY = 'test';
process.env.NOTIFICATION_BOT_URL = 'http://example.com';
process.env.LESSON_PICKER_URL = 'http://example.com';
process.env.DISPATCHER_URL = 'http://example.com';
process.env.DATA_AGGREGATOR_URL = 'http://example.com';
process.env.CURRICULUM_MODIFIER_URL = 'http://example.com';
process.env.QA_FORMATTER_URL = 'http://example.com';

(async () => {
  const logs: any[] = [];
  const { callWithRetry } = await import('./retry');
  const { supabase } = await import('./supabase');
  (supabase as any).from = (_: string) => ({
    insert: async (record: any) => {
      logs.push(record);
    },
  });

  // Success case
  logs.length = 0;
  const successFetch = async () => ({ ok: true, status: 200 } as any);
  const resp = await callWithRetry(
    'http://example.com',
    {},
    'test-run',
    'success-step',
    1,
    successFetch
  );
  assert.equal(resp.status, 200);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].success, true);

  // Failure case
  logs.length = 0;
  const failureFetch = async () => ({ ok: false, status: 500 } as any);
  let caught = false;
  try {
    await callWithRetry(
      'http://example.com',
      {},
      'test-run',
      'fail-step',
      1,
      failureFetch
    );
  } catch (err: any) {
    caught = true;
    assert.equal(err.message, 'HTTP 500');
  }
  assert.ok(caught);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].success, false);
  assert.equal(logs[0].message, 'HTTP 500');
})();
