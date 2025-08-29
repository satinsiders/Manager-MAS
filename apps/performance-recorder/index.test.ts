import assert from 'assert';

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

class MockRedis {
  public lastExpire: [string, number] | null = null;
  async lpush(_key: string, _value: number) {}
  async ltrim(_key: string, _start: number, _end: number) {}
  async expire(key: string, ttl: number) {
    this.lastExpire = [key, ttl];
  }
}

(async () => {
  const { updateLastScores, LAST_SCORES_TTL } = await import('./index');
  const redis = new MockRedis();
  await updateLastScores('student', 1, redis as any);
  assert.deepStrictEqual(redis.lastExpire, [`last_3_scores:student`, LAST_SCORES_TTL]);
  console.log('TTL set correctly');
})();
