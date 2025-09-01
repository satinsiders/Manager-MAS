import assert from 'node:assert/strict';
import http from 'node:http';

process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'key';
process.env.SLACK_WEBHOOK_URL = 'http://localhost';
process.env.OPENAI_API_KEY = 'test';
process.env.NOTIFICATION_BOT_URL = 'http://localhost';
process.env.LESSON_PICKER_URL = 'http://localhost';
process.env.DISPATCHER_URL = 'http://localhost';
process.env.DATA_AGGREGATOR_URL = 'http://localhost';
process.env.CURRICULUM_EDITOR_URL = 'http://localhost';
process.env.QA_FORMATTER_URL = 'http://localhost';
process.env.UPSTASH_REDIS_REST_URL = 'http://localhost';
process.env.UPSTASH_REDIS_REST_TOKEN = 'token';

(async () => {
  const server = http.createServer((_req, res) => {
    res.statusCode = 500;
    res.end('fail');
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const url = `http://localhost:${port}`;

  const { supabase } = await import('./supabase');
  (supabase as any).from = () => ({ insert: async () => ({}) });

  const { callWithRetry, BASE_DELAY_MS } = await import('./retry');

  const start = Date.now();
  let threw = false;
  try {
    await callWithRetry(url, {}, 'test', 'step', 2);
  } catch {
    threw = true;
  }
  const elapsed = Date.now() - start;
  server.close();

  assert.equal(threw, true);
  assert(elapsed >= BASE_DELAY_MS);
  console.log('callWithRetry throws after retries with backoff');
})();

