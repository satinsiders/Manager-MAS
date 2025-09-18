import assert from 'node:assert/strict';

// Set required environment variables before importing config-dependent modules
process.env.SLACK_WEBHOOK_URL = 'http://example.com';
process.env.OPENAI_API_KEY = 'test';
process.env.SUPABASE_URL = 'http://example.com';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'key';
process.env.NOTIFICATION_BOT_URL = 'http://example.com';
process.env.LESSON_PICKER_URL = 'http://example.com';
process.env.DISPATCHER_URL = 'http://example.com';
process.env.ASSIGNMENTS_URL = 'http://example.com';
process.env.DATA_AGGREGATOR_URL = 'http://example.com';
process.env.CURRICULUM_EDITOR_URL = 'http://example.com';
process.env.QA_FORMATTER_URL = 'http://example.com';
process.env.SUPERFASTSAT_API_URL = 'http://example.com';
process.env.SUPERFASTSAT_API_TOKEN = 'token';
process.env.ORCHESTRATOR_URL = 'http://example.com';
process.env.ORCHESTRATOR_SECRET = 'secret';
process.env.SCHEDULER_SECRET = 'sched-secret';

(async () => {
  const cache: Record<string, any> = {};

  const mockClient = {
    from(table: string) {
    if (table !== 'draft_cache') throw new Error('Unexpected table');
    return {
      upsert: async (payload: any) => {
        cache[payload.cache_key] = {
          value: payload.value,
          expires_at: payload.expires_at,
        };
        return { data: payload };
      },
      select: () => {
          const builder: any = {
            filter: null,
            eq(column: string, value: string) {
              this.filter = { column, value };
              return this;
            },
          limit() {
            return this;
          },
          async maybeSingle() {
            const key = this.filter?.value;
            return { data: cache[key] ?? null };
          },
        };
        return builder;
      },
      delete: () => ({
        async eq(_column: string, value: string) {
          delete cache[value];
          return { data: null };
        },
      }),
    };
  },
  };

  const memory = await import('./memory');
  memory.setMemoryClient(mockClient as any);

  await memory.writeDraft('user1', { foo: 'bar' }, 120);
  assert.deepEqual(cache['draft:user1'].value, { foo: 'bar' });

  const val = await memory.readDraft<{ foo: string }>('user1');
  assert.deepEqual(val, { foo: 'bar' });

  await memory.deleteDraft('user1');
  assert.equal(cache['draft:user1'], undefined);

  const missing = await memory.readDraft('missing');
  assert.equal(missing, null);

  console.log('Memory helpers work with TTL and prefix');
})();
