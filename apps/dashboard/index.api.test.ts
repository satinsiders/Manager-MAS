import assert from 'node:assert/strict';
import { createDashboardHandler } from './index';
import { createMockReq, createMockRes } from '../../packages/shared/testUtils';

const students = [
  {
    id: 'student-1',
    name: 'Jordan',
    timezone: 'America/New_York',
    platform_student_id: '101',
    current_curriculum_version: 2,
    last_lesson_sent: null,
    active: true,
  },
  {
    id: 'student-2',
    name: 'Sky',
    timezone: 'America/Chicago',
    platform_student_id: '102',
    current_curriculum_version: null,
    last_lesson_sent: null,
    active: true,
  },
];

const drafts = [
  { student_id: 'student-1', version: 3, study_plan: { objectives: ['algebra'] }, created_at: '2024-05-01T00:00:00.000Z' },
];

const progress = [
  { student_id: 'student-1', status: 'mastered', last_decision_at: '2024-05-02T00:00:00.000Z' },
  { student_id: 'student-1', status: 'in_progress', last_decision_at: '2024-05-03T00:00:00.000Z' },
];

const performance = [
  { student_id: 'student-1', date: '2024-05-02', avg_correctness: 90, avg_confidence: 0.8, units: 5 },
];

const dispatches = [
  { student_id: 'student-1', remaining_minutes: 40, total_minutes: 120, last_dispatched_at: '2024-05-04T00:00:00.000Z' },
];

function createSupabaseStub() {
  return {
    from(table: string) {
      if (table === 'students') {
        return {
          select: () => ({
            eq: (field: string, value: any) => {
              if (field === 'id') {
                const student = students.find((row) => row.id === value) ?? null;
                return {
                  maybeSingle: () => Promise.resolve({ data: student, error: null }),
                };
              }
              if (field === 'active') {
                return Promise.resolve({ data: students, error: null });
              }
              return Promise.resolve({ data: null, error: null });
            },
            maybeSingle: () => Promise.resolve({ data: students[0], error: null }),
          }),
        };
      }
      if (table === 'study_plan_drafts') {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: drafts, error: null }),
          }),
        };
      }
      if (table === 'study_plan_progress') {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: progress, error: null }),
          }),
        };
      }
      if (table === 'daily_performance') {
        return {
          select: () => ({
            in: () => ({
              gte: () => Promise.resolve({ data: performance, error: null }),
            }),
          }),
        };
      }
      if (table === 'platform_dispatches') {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: dispatches, error: null }),
          }),
        };
      }
      return {
        select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }),
      };
    },
  } as any;
}

(async () => {
  const platformCalls: string[] = [];
  const handler = createDashboardHandler({
    supabaseClient: createSupabaseStub(),
    platformJson: async <T = any>(path: string): Promise<T> => {
      platformCalls.push(path);
      if (path.startsWith('/student-curriculums')) {
        return [{ id: 1, remainingDuration: 120 }] as T;
      }
      if (path.startsWith('/study-schedules')) {
        return [{ studySchedule: { scheduledDate: '2024-05-05', totalDuration: 60 } }] as T;
      }
      return [] as T;
    },
  });

  const res = createMockRes();
  await handler(createMockReq({ method: 'GET', query: { student_id: 'student-1' } }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.totals.activeStudents, 1);
  assert.equal(res.body.totals.openDrafts, 1);
  assert.equal(res.body.totals.flaggedStudents, 0);
  assert(res.body.alerts.length >= 0);
  assert(platformCalls.some((path) => path.includes('/student-curriculums')));
  assert(res.body.selectedStudent);
  console.log('dashboard handler passes tests');
})();
