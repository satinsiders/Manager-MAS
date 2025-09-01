import assert from 'node:assert/strict';

// Set environment variables required by config
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
  async lrange(_key: string, _start: number, _end: number) {
    return ['80', '70', '60'];
  }
}

let rpcArgs: any = null;
const mockSupabase = {
  from(table: string) {
    if (table === 'students') {
      return {
        select() {
          return {
            eq() {
              return {
                single: async () => ({
                  data: {
                    preferred_topics: ['algebra'],
                    last_lesson_id: 'l1'
                  }
                })
              };
            }
          };
        }
      };
    }
    if (table === 'curricula') {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    single: async () => ({
                      data: {
                        curriculum: {
                          lessons: [
                            { id: 'l3', units: [{ id: 'u1', duration_minutes: 5 }] }
                          ]
                        }
                      }
                    })
                  };
                }
              };
            }
          };
        }
      };
    }
    if (table === 'assignments') {
      return {
        select() {
          return {
            eq() {
              return {
                eq: () => ({ data: [] })
              };
            }
          };
        }
      };
    }
    return {} as any;
  },
  async rpc(fn: string, args: any) {
    rpcArgs = { fn, args };
    return {
      data: [
        { id: 'l1', difficulty: 1 },
        { id: 'l2', difficulty: 2 },
        { id: 'l3', difficulty: 3 }
      ]
    };
  }
};

(async () => {
  const { selectNextLesson } = await import('./index');
  const result = await selectNextLesson('student1', 2, {
    redis: new MockRedis() as any,
    supabase: mockSupabase as any
  });
  assert.equal(result.next_lesson_id, 'l3');
  assert.equal(result.minutes, 15);
  assert.equal(result.units[0].id, 'u1');
  assert.equal(rpcArgs.fn, 'match_lessons');
  console.log('Lesson picker selection tests passed');
})();
