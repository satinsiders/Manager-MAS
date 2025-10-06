import { randomUUID } from 'crypto';
import { supabase } from '../../packages/shared/supabase';
import { withSessionContextAsync } from '../../packages/shared/authSessions';
import type { RefreshSummary, StudentRow } from './refresh';
import { refreshAllStudents, refreshStudentsByIds } from './refresh';

export type StudentProgress = {
  id: string;
  platformStudentId: string | null;
  name: string | null;
  status: 'pending' | 'refreshing' | 'complete' | 'error';
  message?: string;
};

export type RefreshJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export type RefreshJob = {
  id: string;
  status: RefreshJobStatus;
  createdAt: string;
  updatedAt: string;
  summary: RefreshSummary;
  students: StudentProgress[];
  error?: string;
};

type RefreshJobInternal = RefreshJob & {
  sessionId: string | null;
  targetStudentIds: string[] | null;
};

const jobs = new Map<string, RefreshJobInternal>();

function nowIso() {
  return new Date().toISOString();
}

async function fetchActiveStudents(studentIds?: string[] | null) {
  if (studentIds && studentIds.length) {
    const { data } = await supabase
      .from('students')
      .select('id, platform_student_id, name, active')
      .in('id', studentIds);
    return (data ?? []).filter((row: any) => row && row.active !== false) as Array<
      StudentRow & { name?: string | null }
    >;
  }
  const { data } = await supabase
    .from('students')
    .select('id, platform_student_id, name, active')
    .eq('active', true);
  return (data ?? []) as Array<StudentRow & { name?: string | null }>;
}

export function getRefreshJob(jobId: string): RefreshJob | null {
  const job = jobs.get(jobId);
  if (!job) return null;
  const { sessionId, targetStudentIds, ...publicJob } = job;
  return publicJob;
}

export function getRefreshJobInternal(jobId: string): RefreshJobInternal | null {
  return jobs.get(jobId) ?? null;
}

function updateJob(job: RefreshJobInternal, updates: Partial<RefreshJobInternal>) {
  Object.assign(job, updates);
  job.updatedAt = nowIso();
}

export async function startRefreshJob(options: { sessionId: string | null; studentIds?: string[] | null }) {
  const { sessionId, studentIds = null } = options;
  const targetStudents = await fetchActiveStudents(studentIds);
  const jobId = randomUUID();
  const job: RefreshJobInternal = {
    id: jobId,
    status: 'pending',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    sessionId,
    targetStudentIds: studentIds ? [...studentIds] : null,
    summary: {
      studentsProcessed: 0,
      datesProcessed: 0,
      scheduleCalls: 0,
      dispatchCalls: 0,
    },
    students: targetStudents.map((student) => ({
      id: student.id,
      platformStudentId: student.platform_student_id ?? null,
      name: student.name ?? null,
      status: 'pending',
    })),
  };
  jobs.set(jobId, job);

  const runner = async () => {
    if (!jobs.has(jobId)) return;
    updateJob(job, { status: 'running' });
    try {
      const runnerFn = async () => {
        if (job.targetStudentIds && job.targetStudentIds.length) {
          const summary = await refreshStudentsByIds(job.targetStudentIds, {
            onStudentStart: (student) => {
              const entry = job.students.find((s) => s.id === student.id);
              if (entry) {
                entry.status = 'refreshing';
                updateJob(job, {});
              }
            },
            onStudentComplete: (student, result) => {
              const entry = job.students.find((s) => s.id === student.id);
              if (!entry) return;
              if (result.success) {
                entry.status = 'complete';
                job.summary.studentsProcessed += 1;
                job.summary.datesProcessed += result.counts.datesProcessed;
                job.summary.scheduleCalls += result.counts.scheduleCalls;
                job.summary.dispatchCalls += result.counts.dispatchCalls;
              } else {
                entry.status = 'error';
                entry.message = result.error;
              }
              updateJob(job, {});
            },
          });
          updateJob(job, { summary });
          return summary;
        }
        const summary = await refreshAllStudents();
        job.summary = summary;
        job.students.forEach((student) => {
          if (student.status === 'pending') student.status = 'complete';
        });
        updateJob(job, {});
        return summary;
      };
      await withSessionContextAsync(sessionId, runnerFn);
      updateJob(job, { status: 'completed' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateJob(job, { status: 'failed', error: message });
    }
  };

  setImmediate(runner);

  const { sessionId: _session, targetStudentIds: _target, ...publicJob } = job;
  return publicJob;
}
