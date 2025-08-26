import assert from 'assert';
import { updateLastScores, LAST_SCORES_TTL } from './index.js';

class MockRedis {
  public lastExpire: [string, number] | null = null;
  async lpush(_key: string, _value: number) {}
  async ltrim(_key: string, _start: number, _end: number) {}
  async expire(key: string, ttl: number) {
    this.lastExpire = [key, ttl];
  }
}

(async () => {
  const redis = new MockRedis();
  await updateLastScores('student', 1, redis as any);
  assert.deepStrictEqual(redis.lastExpire, [`last_3_scores:student`, LAST_SCORES_TTL]);
  console.log('TTL set correctly');
})();
