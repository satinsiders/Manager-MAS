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

(async () => {
  const { selectNextLesson } = await import('./index');

  let rpcArgs: any = null;

  // Successful insert case
  let inserted: any = null;
  const mockSupabase = {
    from(table: string) {
      if (table === 'students') {
        return {
          select() {
            return {
              eq() {
                return {
                  single: async () => ({
                    data: { preferred_topics: ['algebra'], last_lesson_id: 'l1' }
                  })
                };
              }
            };
          }
        };
      }
      if (table === 'dispatch_log') {
        return {
          insert(fields: any) {
            inserted = fields;
            return Promise.resolve({});
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

  const result = await selectNextLesson('student1', {
    redis: new MockRedis() as any,
    supabase: mockSupabase as any
  });
  assert.equal(result.next_lesson_id, 'l3');
  assert.equal(result.minutes, 15);
  assert.equal(rpcArgs.fn, 'match_lessons');
  assert.equal(inserted.student_id, 'student1');
  assert.equal(inserted.lesson_id, 'l3');
  assert.equal(inserted.status, 'selected');
  assert.ok(inserted.sent_at);

  // Failure case should not throw
  let insertAttempted = false;
  const failingSupabase = {
    from(table: string) {
      if (table === 'students') {
        return {
          select() {
            return {
              eq() {
                return {
                  single: async () => ({
                    data: { preferred_topics: ['algebra'], last_lesson_id: 'l1' }
                  })
                };
              }
            };
          }
        };
      }
      if (table === 'dispatch_log') {
        return {
          insert() {
            insertAttempted = true;
            return Promise.reject(new Error('insert failed'));
          }
        };
      }
      return {} as any;
    },
    async rpc(fn: string, args: any) {
      return {
        data: [
          { id: 'l1', difficulty: 1 },
          { id: 'l2', difficulty: 2 },
          { id: 'l3', difficulty: 3 }
        ]
      };
    }
  };

  const result2 = await selectNextLesson('student1', {
    redis: new MockRedis() as any,
    supabase: failingSupabase as any
  });
  assert.equal(result2.next_lesson_id, 'l3');
  assert.equal(insertAttempted, true);

  console.log('Lesson picker selection tests passed');
})();

