import assert from 'node:assert/strict';
import { createActivityLogHandler } from './index';
import { createMockReq, createMockRes } from '../../packages/shared/testUtils';

const decisions = [
  {
    id: 'dec-1',
    student_id: 'student-1',
    study_plan_version: 3,
    decision_type: 'continue',
    policy_version: 'v1',
    decided_at: '2024-05-05T00:00:00.000Z',
  },
];

const actions = [
  {
    id: 'act-1',
    decision_id: 'dec-1',
    action_type: 'dispatch_minutes',
    status: 'success',
    requested_minutes: 30,
    actual_minutes: 30,
    attempted_at: '2024-05-05T01:00:00.000Z',
  },
];

const planPublishes = [
  {
    id: 'plan-1',
    student_id: 'student-1',
    version: 3,
    approved_at: '2024-05-04T00:00:00.000Z',
    qa_user: 'qa',
  },
];

const drafts = [
  {
    student_id: 'student-1',
    version: 4,
    created_at: '2024-05-06T00:00:00.000Z',
  },
];

const dispatches = [
  {
    id: 'disp-1',
    student_id: 'student-1',
    study_plan_id: 'plan-1',
    minutes: 30,
    status: 'completed',
    sent_at: '2024-05-05T02:00:00.000Z',
  },
];

function createSupabaseStub() {
  return {
    from(table: string) {
      const dataLookup: Record<string, any[]> = {
        mas_decisions: decisions,
        mas_actions: actions,
        study_plans: planPublishes,
        study_plan_drafts: drafts,
        dispatch_log: dispatches,
      };
      const rows = dataLookup[table] ?? [];
      return {
        select: () => ({
          order: () => ({ limit: () => Promise.resolve({ data: rows, error: null }) }),
          limit: () => Promise.resolve({ data: rows, error: null }),
          in: () => Promise.resolve({ data: rows, error: null }),
        }),
      };
    },
  } as any;
}

(async () => {
  const handler = createActivityLogHandler({ supabaseClient: createSupabaseStub() });
  const res = createMockRes();
  await handler(createMockReq({ method: 'GET', query: { limit: '10' } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.events.length, 5);
  assert(res.body.events.some((event: any) => event.type === 'dispatch'));
  console.log('activity-log handler passes tests');
})();
