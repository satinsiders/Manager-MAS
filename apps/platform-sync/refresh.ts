import type { VercelRequest, VercelResponse } from '../../packages/shared/vercel';
import { withSessionContextAsync, getSession, parseCookieHeader, sessionCookieName } from '../../packages/shared/authSessions';
import { hasStaticPlatformToken } from '../../packages/shared/platformAuth';
import { syncStudentsRoster } from './students';
import { supabase } from '../../packages/shared/supabase';
import { platformJson } from '../../packages/shared/platform';
import { mapStudentCurriculums, upsertCatalogFromDispatches } from './catalog';
import { upsertDispatchMirror, upsertDailyPerformance, upsertDailyPerformanceUnits } from './mirrors';
import type { DailyPerformance, DailyPerformanceUnit } from './types';

const LOOKBACK_DAYS = parseInt(process.env.PLATFORM_REFRESH_LOOKBACK_DAYS ?? '7', 10);
const MAX_DATE_RANGE_DAYS = Math.max(LOOKBACK_DAYS, 1);
const REFRESH_CONCURRENCY = Math.max(1, parseInt(process.env.PLATFORM_REFRESH_CONCURRENCY ?? '4', 10));

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function toDateOnly(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0, 10);
}

function enumerateDates(start: string, end: string): string[] {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
    return [];
  }
  const results: string[] = [];
  for (let d = startDate; d <= endDate; d = addDays(d, 1)) {
    results.push(toDateOnly(d));
    if (results.length > 365) break;
  }
  return results;
}

function getSessionIdFromRequest(req: VercelRequest): string | null {
  const header = (req.headers['cookie'] as string) ?? '';
  const cookies = parseCookieHeader(header);
  const fromHeader = cookies[sessionCookieName];
  if (fromHeader) return fromHeader;
  if (req.cookies && typeof req.cookies === 'object') {
    const direct = (req.cookies as Record<string, string | undefined>)[sessionCookieName];
    if (direct) return direct;
  }
  return null;
}

export type StudentRow = {
  id: string;
  platform_student_id: string | null;
};

export type RefreshSummary = {
  studentsProcessed: number;
  datesProcessed: number;
  scheduleCalls: number;
  dispatchCalls: number;
};

async function getLastPerformanceDate(studentId: string): Promise<string | null> {
  const { data } = await supabase
    .from('daily_performance')
    .select('date')
    .eq('student_id', studentId)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.date ?? null;
}

export async function refreshStudentData(student: StudentRow) {
  if (!student.platform_student_id) {
    return { datesProcessed: 0, scheduleCalls: 0, dispatchCalls: 0 };
  }
  const platformId = Number(student.platform_student_id);
  if (!Number.isFinite(platformId)) {
    return { datesProcessed: 0, scheduleCalls: 0, dispatchCalls: 0 };
  }

  let dispatchCalls = 0;
  let scheduleCalls = 0;

  const dispatchUrl = `/student-curriculums?studentId=${platformId}&includeStopped=true&includeNoRemainingDuration=true`;
  try {
    const curriculumList: any = await platformJson(dispatchUrl);
    const list = Array.isArray(curriculumList) ? curriculumList : curriculumList?.items ?? [];
    const dispatchRows = mapStudentCurriculums(list, student.id);
    if (dispatchRows.length) {
      await upsertDispatchMirror(dispatchRows);
      await upsertCatalogFromDispatches(dispatchRows);
      dispatchCalls += 1;
    }
  } catch (err) {
    console.error('Failed to refresh student curriculums', student.platform_student_id, err);
  }

  const lastDate = await getLastPerformanceDate(student.id);
  const today = getTodayDate();
  let startDate: string;
  if (lastDate) {
    const next = toDateOnly(addDays(new Date(lastDate), 1));
    startDate = next;
  } else {
    const start = addDays(new Date(today), -MAX_DATE_RANGE_DAYS + 1);
    startDate = toDateOnly(start);
  }
  if (new Date(startDate) > new Date(today)) {
    return { datesProcessed: 0, scheduleCalls, dispatchCalls };
  }
  const requestedDates = enumerateDates(startDate, today);
  if (!requestedDates.length) {
    return { datesProcessed: 0, scheduleCalls, dispatchCalls };
  }

  const rows: DailyPerformance[] = [];
  const unitDetails: DailyPerformanceUnit[] = [];

  for (const date of requestedDates) {
    try {
      const schedules: any = await platformJson(
        `/study-schedules?studentId=${platformId}&scheduledDate=${date}`,
      );
      scheduleCalls += 1;
      const summaries = Array.isArray(schedules) ? schedules : schedules?.items ?? [];
      for (const schedule of summaries) {
        const scheduleInfo = schedule.studySchedule ?? schedule;
        const scheduleDate = scheduleInfo?.scheduledDate ?? scheduleInfo?.date ?? date;
        const lessons: any[] = schedule.studyLessons ?? schedule.lessons ?? [];
        for (const lesson of lessons) {
          const lessonIdentifier = lesson.lesson?.id ?? lesson.lessonId ?? lesson.id ?? null;
          const curriculumId = String(
            lesson.lesson?.curriculumId ??
              scheduleInfo?.curriculumId ??
              scheduleInfo?.curriculum?.id ??
              lesson.curriculumId ??
              lessonIdentifier ?? `${scheduleDate}:${Math.random().toString(36).slice(2, 8)}`,
          );
          const lessonId = String(lessonIdentifier ?? curriculumId);
          const units: any[] = lesson.studyUnits ?? lesson.units ?? [];
          const correctCount = units.filter((u: any) => u.isCorrect === true).length;
          const confidences = units
            .map((u: any) => (typeof u.confidence === 'number' ? Number(u.confidence) : null))
            .filter((v) => v !== null) as number[];
          const avgConfidence = confidences.length
            ? confidences.reduce((sum, v) => sum + v, 0) / confidences.length
            : null;
          const avgCorrectness = units.length ? Math.round((correctCount / units.length) * 100) : null;

          rows.push({
            student_id: student.id,
            date: scheduleDate,
            external_curriculum_id: curriculumId,
            bundle_ref: String(lessonId || `${scheduleDate}:${Math.random().toString(36).slice(2, 8)}`),
            avg_correctness: avgCorrectness,
            avg_confidence: avgConfidence,
            units: units.length || null,
          });

          units.forEach((unit: any, idx: number) => {
            const unitId = String(unit.unit?.id ?? unit.unitId ?? unit.id ?? `${lessonId}:${idx}`);
            unitDetails.push({
              student_id: student.id,
              date: scheduleDate,
              external_curriculum_id: curriculumId,
              lesson_id: lessonId,
              unit_id: unitId,
              unit_seq: unit.unitSeq ?? unit.unit?.unitSeq ?? idx,
              is_completed: typeof unit.isCompleted === 'boolean' ? unit.isCompleted : null,
              is_correct: typeof unit.isCorrect === 'boolean' ? unit.isCorrect : null,
              confidence: typeof unit.confidence === 'number' ? Number(unit.confidence) : null,
              consecutive_correct_count:
                typeof lesson.consecutiveCorrectCount === 'number' ? lesson.consecutiveCorrectCount : null,
              raw: unit,
            });
          });
        }
      }
    } catch (err) {
      console.error('Failed to refresh study schedules', student.platform_student_id, date, err);
    }
  }

  if (rows.length) {
    await upsertDailyPerformance(rows);
  }
  if (unitDetails.length) {
    await upsertDailyPerformanceUnits(unitDetails);
  }

  return {
    datesProcessed: requestedDates.length,
    scheduleCalls,
    dispatchCalls,
  };
}

type RefreshCallbacks = {
  onStudentStart?: (student: StudentRow & { name?: string | null }) => void;
  onStudentComplete?: (
    student: StudentRow & { name?: string | null },
    result:
      | { success: true; counts: { datesProcessed: number; scheduleCalls: number; dispatchCalls: number } }
      | { success: false; error: string },
  ) => void;
};

export async function refreshStudentsByIds(
  studentIds: string[],
  callbacks: RefreshCallbacks = {},
): Promise<RefreshSummary> {
  const summary: RefreshSummary = {
    studentsProcessed: 0,
    datesProcessed: 0,
    scheduleCalls: 0,
    dispatchCalls: 0,
  };
  const uniqueIds = Array.from(new Set(studentIds.filter(Boolean)));
  if (!uniqueIds.length) return summary;
  const { data } = await supabase
    .from('students')
    .select('id, platform_student_id, active, name')
    .in('id', uniqueIds);
  const rows = (data ?? []).filter((row: any) => row && row.active !== false) as Array<
    StudentRow & { name?: string | null }
  >;
  if (!rows.length) return summary;
  let index = 0;
  const limit = Math.min(REFRESH_CONCURRENCY, rows.length);
  const workers = Array.from({ length: limit }, async () => {
    while (true) {
      const current = index;
      index += 1;
      if (current >= rows.length) break;
      const student = rows[current];
      callbacks.onStudentStart?.(student);
      try {
        const counts = await refreshStudentData(student);
        summary.studentsProcessed += 1;
        summary.datesProcessed += counts.datesProcessed;
        summary.scheduleCalls += counts.scheduleCalls;
        summary.dispatchCalls += counts.dispatchCalls;
        callbacks.onStudentComplete?.(student, { success: true, counts });
      } catch (err) {
        console.error('Failed to refresh student', student.id, err);
        callbacks.onStudentComplete?.(student, {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  });
  await Promise.all(workers);
  return summary;
}

export async function refreshAllStudents(): Promise<RefreshSummary> {
  await syncStudentsRoster();
  const { data: students } = await supabase
    .from('students')
    .select('id, platform_student_id, active')
    .eq('active', true);
  return refreshStudentsByIds((students ?? []).map((row) => (row as StudentRow).id));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const hasStaticToken = hasStaticPlatformToken();
  const sessionId = getSessionIdFromRequest(req);
  const session = hasStaticToken ? null : getSession(sessionId);
  if (!hasStaticToken) {
    if (!session) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }
    if (!session.token) {
      res.status(400).json({ error: 'platform_auth_not_configured' });
      return;
    }
  }

  try {
    const summary = await withSessionContextAsync(session?.id ?? null, async () => refreshAllStudents());
    res.status(200).json(summary);
  } catch (err: any) {
    console.error('platform refresh failed', err);
    res.status(500).json({ error: err?.message ?? 'refresh_failed' });
  }
}

export const config = {
  api: {
    bodyParser: true,
  },
};
