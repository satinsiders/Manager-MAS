import assert from 'node:assert/strict';
import http from 'node:http';

// Provide required env variables before importing modules
process.env.SLACK_WEBHOOK_URL = 'http://localhost';
process.env.OPENAI_API_KEY = 'test';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'key';
process.env.ORCHESTRATOR_SECRET = 'secret';
process.env.SUPERFASTSAT_API_URL = 'http://localhost';
process.env.SUPERFASTSAT_API_TOKEN = 'token';
process.env.ORCHESTRATOR_URL = 'http://localhost';
process.env.SCHEDULER_SECRET = 'sched-secret';

(async () => {
  // start mock server
  let dispatcherBody: any = null;
  let lessonPickerBody: any = null;
  let assignmentsBody: any = null;
  let curriculumBody: any = null;
  let lessonPickerResp: any = { minutes: 5, next_lesson_id: 'l42' };
  const qaBodies: any[] = [];
  let qaStatus = 200;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      if (req.url === '/lesson-picker') {
        lessonPickerBody = body ? JSON.parse(body) : null;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(lessonPickerResp));
      } else if (req.url === '/assignments') {
        assignmentsBody = body ? JSON.parse(body) : null;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          assignment_id: 'a1',
          ...(assignmentsBody || {}),
        }));
      } else if (req.url === '/dispatcher') {
        dispatcherBody = body ? JSON.parse(body) : null;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
      } else if (req.url === '/mod') {
        curriculumBody = body ? JSON.parse(body) : null;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
      } else if (req.url === '/qa') {
        qaBodies.push(body ? JSON.parse(body) : null);
        res.writeHead(qaStatus, { 'Content-Type': 'application/json' });
        res.end('{}');
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const base = `http://localhost:${port}`;

  // set URLs dependent on server
process.env.LESSON_PICKER_URL = `${base}/lesson-picker`;
process.env.DISPATCHER_URL = `${base}/dispatcher`;
process.env.ASSIGNMENTS_URL = `${base}/assignments`;
process.env.NOTIFICATION_BOT_URL = `${base}/notify`;
  process.env.DATA_AGGREGATOR_URL = `${base}/agg`;
  process.env.CURRICULUM_EDITOR_URL = `${base}/mod`;
  process.env.QA_FORMATTER_URL = `${base}/qa`;

    class MockMemoryClient {
      store = new Map<string, any>();
      throwKey: string | null = null;

      from(table: string) {
        if (table !== 'draft_cache') throw new Error(`Unexpected table ${table}`);
        const self = this;
        return {
          upsert: async (payload: any) => {
            if (self.throwKey === payload.cache_key) throw new Error('boom');
            self.store.set(payload.cache_key, {
              value: payload.value,
              expires_at: payload.expires_at,
            });
            return { data: payload };
          },
          select() {
            return {
              key: '',
              eq(_column: string, value: string) {
                this.key = value;
                return this;
              },
              limit() {
                return this;
              },
              async maybeSingle() {
                if (self.throwKey === this.key) throw new Error('boom');
                return { data: self.store.get(this.key) ?? null };
              },
            };
          },
          delete() {
            return {
              async eq(_column: string, value: string) {
                self.store.delete(value);
                return { data: null };
              },
            };
          },
        };
      }
    }

    const memory = await import('../../packages/shared/memory');
    const mockMemory = new MockMemoryClient();
    memory.setMemoryClient(mockMemory as any);

    const { default: handler } = await import('./index');
    const { supabase } = await import('../../packages/shared/supabase');

  let drafts: any[] = [];
  let deleted: any[] = [];

  (supabase as any).from = (table: string) => {
    if (table === 'students') {
      return {
        select: () => ({ eq: () => ({ data: [{ id: 1, current_curriculum_version: 2 }] }) })
      };
    }
    if (table === 'curricula_drafts') {
      return {
        select: () => ({ data: drafts }),
        delete: () => ({
          eq: (_col: string, val: any) => ({
            eq: (_col2: string, val2: any) => {
              deleted.push({ student_id: val, version: val2 });
              return Promise.resolve({});
            },
          }),
        }),
      };
    }
    return {
      insert: async () => ({})
    };
  };

  // unauthorized request
  const reqUnauthorized = { query: { run_type: 'daily' }, headers: {} } as any;
  let unauthorizedStatus = 0;
  const resUnauthorized: any = {
    status(code: number) {
      unauthorizedStatus = code;
      return { json() {} };
    }
  };
  await handler(reqUnauthorized, resUnauthorized);
  assert.equal(unauthorizedStatus, 401);

  // authorized request - minutes only
  dispatcherBody = null;
  const req = {
    query: { run_type: 'daily' },
    headers: { authorization: `Bearer ${process.env.ORCHESTRATOR_SECRET}` }
  } as any;
  let status = 0;
  const res: any = {
    status(code: number) {
      status = code;
      return { json() {} };
    }
  };

  await handler(req, res);

  assert.equal(status, 200);
  assert.equal(mockMemory.store.size, 0);

  assert.equal(dispatcherBody.student_id, 1);
  assert.equal(dispatcherBody.minutes, 5);
  assert.equal(dispatcherBody.next_lesson_id, 'l42');
  assert.equal(assignmentsBody.student_id, 1);
  assert.equal(lessonPickerBody.curriculum_version, 2);

  // authorized request - units present
  dispatcherBody = null;
  lessonPickerResp = { minutes: 5, units: [{ id: 'u1' }] };
  await handler(req, res);

  assert.equal(status, 200);
  assert.equal(mockMemory.store.size, 0);
  assert.deepEqual(dispatcherBody.units, [{ id: 'u1' }]);
  assert.equal(dispatcherBody.minutes, undefined);

  // lesson picker requests new curriculum
  dispatcherBody = null;
  curriculumBody = null;
  lessonPickerResp = { action: 'request_new_curriculum' };
  await handler(req, res);
  assert.equal(status, 200);
  assert.equal(curriculumBody.student_id, 1);
  assert.equal(dispatcherBody, null);

  // failure during orchestration should also clean drafts
  dispatcherBody = null;
  lessonPickerResp = { minutes: 5 };
  mockMemory.throwKey = 'draft:lesson-picker:1';
  status = 0;
  await handler(req, res);
  assert.equal(status, 500);
  assert.equal(mockMemory.store.size, 0);

  // weekly run should process drafts and retain qa_user
  const reqWeekly = {
    query: { run_type: 'weekly' },
    headers: { authorization: `Bearer ${process.env.ORCHESTRATOR_SECRET}` },
  } as any;

  // successful run with qa_user defaulting when missing
  qaBodies.length = 0;
  drafts = [
    { student_id: 's1', version: 1, qa_user: 'qa1' },
    { student_id: 's2', version: 1 },
  ];
  deleted = [];
  qaStatus = 200;
  await handler(reqWeekly, res);
  assert.equal(qaBodies.length, 2);
  assert.deepEqual(qaBodies[0], { student_id: 's1', version: 1, qa_user: 'qa1' });
  assert.deepEqual(qaBodies[1], { student_id: 's2', version: 1, qa_user: 'system' });
  assert.deepEqual(deleted, [
    { student_id: 's1', version: 1 },
    { student_id: 's2', version: 1 },
  ]);

  // failed run should not delete drafts
  qaBodies.length = 0;
  drafts = [{ student_id: 's3', version: 1, qa_user: 'qa3' }];
  deleted = [];
  qaStatus = 500;
  await handler(reqWeekly, res);
  assert.equal(qaBodies.length, 3); // retries
  assert.deepEqual(qaBodies[0], { student_id: 's3', version: 1, qa_user: 'qa3' });
  assert.deepEqual(deleted, []);

  server.close();

  console.log('Orchestrator draft cleanup tests passed');
})();
