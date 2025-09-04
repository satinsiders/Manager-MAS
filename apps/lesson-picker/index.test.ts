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
process.env.SUPERFASTSAT_API_URL = 'http://example.com';
process.env.ORCHESTRATOR_URL = 'http://example.com';
process.env.ORCHESTRATOR_SECRET = 'secret';
process.env.SCHEDULER_SECRET = 'sched-secret';
process.env.TEACHER_API_KEY = 'key';
process.env.TEACHER_ID = 'teacher';

class MockRedis {
  async lrange(_key: string, _start: number, _end: number) {
    return ['80', '70', '60'];
  }
}

let rpcArgs: any = null;

function baseFrom(table: string) {
  if (table === 'students') {
    return {
      select() {
        return {
          eq() {
            return {
              single: async () => ({
                data: {
                  preferred_topics: ['algebra', 'geometry'],
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
}

function createSupabase(onInsert: (fields: any) => Promise<void>) {
  return {
    from(table: string) {
      if (table === 'dispatch_log') {
        return {
          insert: async (fields: any) => {
            await onInsert(fields);
            return {} as any;
          }
        };
      }
      return baseFrom(table);
    },
    async rpc(fn: string, args: any) {
      rpcArgs = { fn, args };
      return {
        data: [
          { id: 'l1', difficulty: 1, topic: 'history' },
          { id: 'l2', difficulty: 2, topic: 'algebra' },
          { id: 'l3', difficulty: 3, topic: 'geometry' }
        ]
      };
    }
  };
}

function createSupabaseWithAssignments(onInsert: (fields: any) => Promise<void>) {
  return {
    from(table: string) {
      if (table === 'dispatch_log') {
        return {
          insert: async (fields: any) => {
            await onInsert(fields);
            return {} as any;
          }
        };
      }
      if (table === 'students') {
        return {
          select() {
            return {
              eq() {
                return {
                  single: async () => ({
                    data: {
                      preferred_topics: ['algebra', 'geometry'],
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
                          curriculum: { lessons: [] }
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
                  eq() {
                    return {
                      data: [
                        {
                          id: 'a1',
                          lesson_id: 'l3',
                          duration_minutes: 12,
                          questions_json: [{ prompt: 'Q1' }]
                        }
                      ]
                    };
                  }
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
          { id: 'l1', difficulty: 1, topic: 'history' },
          { id: 'l2', difficulty: 2, topic: 'algebra' },
          { id: 'l3', difficulty: 3, topic: 'geometry' }
        ]
      };
    }
  };
}

class MockOpenAI {
  embeddings = {
    create: async (_opts: any) => ({
      data: [
        { embedding: Array(1536).fill(0.1) }
      ]
    })
  };
}

(async () => {
  const { selectNextLesson } = await import('./index');

  // Successful insert path
  let inserted: any = null;
  const supabase = createSupabase(async (fields: any) => {
    inserted = fields;
  });
  const result = await selectNextLesson('student1', 2, {
    redis: new MockRedis() as any,
    supabase: supabase as any,
    openai: new MockOpenAI() as any
  });
  assert.equal(result.next_lesson_id, 'l3');
  assert.equal(result.minutes, 15);
  assert.equal(result.units[0].id, 'u1');
  assert.equal(rpcArgs.fn, 'match_lessons');
  assert.equal(rpcArgs.args.query_embedding.length, 1536);
  assert.equal(inserted.student_id, 'student1');
  assert.equal(inserted.lesson_id, 'l3');
  assert.equal(inserted.status, 'selected');
  assert.ok(inserted.sent_at);

  // Failure path should not throw
  rpcArgs = null;
  let attempted = false;
  const failingSupabase = createSupabase(async (_fields: any) => {
    attempted = true;
    throw new Error('insert failed');
  });
  const result2 = await selectNextLesson('student1', 2, {
    redis: new MockRedis() as any,
    supabase: failingSupabase as any,
    openai: new MockOpenAI() as any
  });
  assert.equal(result2.next_lesson_id, 'l3');
  assert(attempted);

  // Assignments fallback includes duration_minutes and questions
  const supabaseAssign = createSupabaseWithAssignments(async () => {});
  const result3 = await selectNextLesson('student1', 2, {
    redis: new MockRedis() as any,
    supabase: supabaseAssign as any,
    openai: new MockOpenAI() as any
  });
  assert.equal(result3.units[0].id, 'a1');
  assert.equal(result3.units[0].duration_minutes, 12);
  assert.deepEqual(result3.units[0].questions, [{ prompt: 'Q1' }]);

  // Rule filters: avoid repeating same topic
  const supabaseRules = createSupabase(async () => {});
  const avoidGeometry = (lesson: any) => lesson.topic !== 'geometry';
  const result4 = await selectNextLesson('student1', 2, {
    redis: new MockRedis() as any,
    supabase: supabaseRules as any,
    openai: new MockOpenAI() as any,
  }, [avoidGeometry]);
  assert.equal(result4.next_lesson_id, 'l2');

  // Rule filters: limit difficulty jumps
  const limitJump = (lesson: any) => Math.abs(lesson.difficulty - 1) <= 1;
  const result5 = await selectNextLesson('student1', 2, {
    redis: new MockRedis() as any,
    supabase: supabaseRules as any,
    openai: new MockOpenAI() as any,
  }, [limitJump]);
  assert.equal(result5.next_lesson_id, 'l2');

  console.log('Lesson picker dispatch log tests passed');
})();
