import assert from 'node:assert/strict';
import { Response } from 'node-fetch';

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

type StudentRow = {
  id: string;
  platform_student_id: string;
  name: string;
  timezone: string;
  current_curriculum_version: number | null;
  active: boolean;
};

function createSupabaseMock(initialStudents: StudentRow[] = []) {
  const students = [...initialStudents];
  const captured = { students };

  return {
    tables: captured,
    from(table: string) {
      if (table === 'students') {
        return {
          select() {
            return {
              eq(_column: string, value: string) {
                const filtered = students.filter(
                  (row) => row.platform_student_id === value
                );
                return {
                  limit() {
                    return Promise.resolve({ data: filtered.slice(0, 1) });
                  },
                };
              },
            };
          },
          insert(payload: any) {
            students.push(payload);
            return Promise.resolve({ data: payload });
          },
          update(payload: any) {
            return {
              eq(_column: string, id: string) {
                const row = students.find((s) => s.id === id);
                if (row) Object.assign(row, payload);
                return Promise.resolve({ data: row ?? null });
              },
            };
          },
        };
      }
      if (table === 'service_log') {
        return {
          insert: async () => ({}),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

(async () => {
  const { syncStudentsRoster } = await import('./students');

  const supabaseNew = createSupabaseMock();
  const response = new Response(
    JSON.stringify([
      {
        id: 101,
        user: { name: 'Alice', email: 'alice@example.com' },
        isValid: true,
      },
    ])
  );

  await syncStudentsRoster(supabaseNew as any, async () => response);

  assert.equal(supabaseNew.tables.students.length, 1);
  assert.equal(supabaseNew.tables.students[0].name, 'Alice');
  assert.equal(supabaseNew.tables.students[0].active, true);

  const existingId = 'existing-id';
  const supabaseExisting = createSupabaseMock([
    {
      id: existingId,
      platform_student_id: '101',
      name: 'Old Name',
      timezone: 'UTC',
      current_curriculum_version: null,
      active: true,
    },
  ]);

  const inactiveResponse = new Response(
    JSON.stringify([
      {
        id: 101,
        user: { name: 'New Name' },
        isValid: false,
      },
    ])
  );

  await syncStudentsRoster(supabaseExisting as any, async () => inactiveResponse);

  assert.equal(supabaseExisting.tables.students.length, 1);
  assert.equal(supabaseExisting.tables.students[0].name, 'New Name');
  assert.equal(supabaseExisting.tables.students[0].active, false);

  console.log('Student roster sync mirrors platform data');
})();

