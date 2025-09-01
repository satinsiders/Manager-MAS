import assert from 'node:assert/strict';

// Set required environment variables before importing config-dependent modules
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

class MockRedis {
  public lastSet: [string, string, any] | null = null;
  public store: Record<string, string> = {};
  async set(key: string, value: string, opts: any) {
    this.lastSet = [key, value, opts];
    this.store[key] = value;
  }
  async get(key: string) {
    return this.store[key] ?? null;
  }
}

(async () => {
  const memory = await import('./memory');
  const mock = new MockRedis();
  memory.setMemoryClient(mock as any);

  await memory.writeDraft('user1', { foo: 'bar' }, 120);
  assert.deepEqual(mock.lastSet, [
    'draft:user1',
    JSON.stringify({ foo: 'bar' }),
    { ex: 120 },
  ]);

  const val = await memory.readDraft<{ foo: string }>('user1');
  assert.deepEqual(val, { foo: 'bar' });

  const missing = await memory.readDraft('missing');
  assert.equal(missing, null);

  console.log('Memory helpers work with TTL and prefix');
})();
