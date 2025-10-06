import assert from 'node:assert/strict';
import { createStudyPlansHandler } from './index';
import { createMockReq, createMockRes } from '../../packages/shared/testUtils';

const sampleSnapshot = {
  student: {
    id: 'student-1',
    name: 'Avery',
    timezone: 'UTC',
    preferred_topics: null,
    platform_student_id: '101',
    current_curriculum_version: 3,
    active: true,
    last_lesson_sent: null,
    last_lesson_id: null,
  },
  active_plan: {
    id: 'plan-uuid',
    student_id: 'student-1',
    version: 3,
    study_plan: { version: 3 },
    qa_user: 'qa',
    approved_at: '2024-05-04T00:00:00.000Z',
  },
  drafts: [],
  progress: [],
  recent_versions: [
    {
      id: 'plan-uuid',
      student_id: 'student-1',
      version: 3,
      study_plan: { version: 3 },
      qa_user: 'qa',
      approved_at: '2024-05-04T00:00:00.000Z',
    },
  ],
};

function createSupabaseStub() {
  return {
    from: () => ({ delete: () => ({ eq: () => ({ error: null }) }) }),
  } as any;
}

async function run(handler: ReturnType<typeof createStudyPlansHandler>, reqOptions: any) {
  const req = createMockReq(reqOptions);
  const res = createMockRes();
  await handler(req, res);
  return res;
}

(async () => {
  {
    let receivedStudentId: string | null = null;
    const handler = createStudyPlansHandler({
      getSnapshot: async (studentId) => {
        receivedStudentId = studentId;
        return sampleSnapshot;
      },
      saveDraft: async () => {
        throw new Error('Should not be called');
      },
      publish: async () => {
        throw new Error('Should not be called');
      },
      supabaseClient: createSupabaseStub(),
    });

    const res = await run(handler, { method: 'GET', query: { student_id: 'student-1' } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.snapshot, sampleSnapshot);
    assert.equal(receivedStudentId, 'student-1');
  }

  {
    let draftPayload: any = null;
    const handler = createStudyPlansHandler({
      getSnapshot: async () => sampleSnapshot,
      saveDraft: async (_studentId, plan) => {
        draftPayload = plan;
        return {
          student_id: 'student-1',
          version: 4,
          study_plan: plan as any,
          created_at: 'now',
        };
      },
      publish: async () => {
        throw new Error('Should not be called');
      },
      supabaseClient: createSupabaseStub(),
    });

    const plan = { version: 4, notes: 'New focus' };
    const res = await run(handler, {
      method: 'POST',
      body: { studentId: 'student-1', plan },
    });
    assert.equal(res.statusCode, 200);
    assert(draftPayload);
    assert.equal(draftPayload.notes, 'New focus');
    assert.equal(res.body.draft.version, 4);
  }

  {
    let publishCalled = false;
    const handler = createStudyPlansHandler({
      getSnapshot: async () => sampleSnapshot,
      saveDraft: async () => ({
        student_id: 'student-1',
        version: 4,
        study_plan: {},
        created_at: 'now',
      }),
      publish: async (studentId, options = {}) => {
        publishCalled = studentId === 'student-1' && options.draftVersion === 4;
        return {
          id: 'plan-uuid',
          student_id: studentId,
          version: 4,
          study_plan: {},
          qa_user: 'qa',
          approved_at: 'now',
        };
      },
      supabaseClient: createSupabaseStub(),
    });

    const res = await run(handler, {
      method: 'PUT',
      body: { studentId: 'student-1', draftVersion: 4 },
    });
    assert.equal(res.statusCode, 200);
    assert(publishCalled);
    assert.equal(res.body.plan.version, 4);
  }

  {
    const handler = createStudyPlansHandler({
      getSnapshot: async () => sampleSnapshot,
      saveDraft: async () => ({
        student_id: 'student-1',
        version: 4,
        study_plan: {},
        created_at: 'now',
      }),
      publish: async () => ({
        id: 'plan',
        student_id: 'student-1',
        version: 4,
        study_plan: {},
        qa_user: 'qa',
        approved_at: 'now',
      }),
      supabaseClient: createSupabaseStub(),
    });

    const res = await run(handler, { method: 'GET', query: {} });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'student_id query parameter is required.');
  }

  console.log('study-plans handler passes tests');
})();
