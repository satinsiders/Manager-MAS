import type { VercelRequest, VercelResponse } from '../../packages/shared/vercel';
import { supabase } from '../../packages/shared/supabase';
import { platformJson } from '../../packages/shared/platform';

function sendError(res: VercelResponse, status: number, message: string) {
  res.status(status).json({ error: message });
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeStudentId(value: unknown): string | null {
  if (!value) return null;
  const asString = Array.isArray(value) ? value[0] : value;
  if (typeof asString !== 'string') return null;
  const trimmed = asString.trim();
  return trimmed.length ? trimmed : null;
}

function isoDateDaysAgo(days: number): string {
  const now = new Date();
  const lookback = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return lookback.toISOString().slice(0, 10);
}

type SummaryStudent = {
  studentId: string;
  name: string | null;
  timezone: string | null;
  platformStudentId: string | null;
  currentPlanVersion: number | null;
  lastLessonSent: string | null;
  active: boolean;
};

type StudentAlert = {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
};

export type DashboardDeps = {
  supabaseClient: typeof supabase;
  platformJson: typeof platformJson;
};

export function createDashboardHandler({ supabaseClient, platformJson: platformJsonFn }: DashboardDeps) {
  return async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      sendError(res, 405, 'Method not allowed.');
      return;
    }

    const studentIdFilter = normalizeStudentId(req.query.student_id ?? req.query.studentId);
    const lookbackRaw = req.query.lookbackDays ?? req.query.lookback_days ?? process.env.DASHBOARD_LOOKBACK_DAYS;
    const lookbackDays = (() => {
      const parsed = Number(lookbackRaw ?? 7);
      if (!Number.isFinite(parsed) || parsed <= 0) return 7;
      return Math.min(30, Math.max(3, Math.floor(parsed)));
    })();
    const sinceDate = isoDateDaysAgo(lookbackDays);

    let students: SummaryStudent[] = [];
    if (studentIdFilter) {
      const { data, error } = await supabaseClient
        .from('students')
        .select('id, name, timezone, platform_student_id, current_curriculum_version, active, last_lesson_sent')
        .eq('id', studentIdFilter)
        .maybeSingle();
      if (error) {
        sendError(res, 500, `Failed to load student ${studentIdFilter}: ${error.message}`);
        return;
      }
      if (data) {
        students = [
          {
            studentId: data.id,
            name: (data as any).name ?? null,
            timezone: data.timezone ?? null,
            platformStudentId: (data as any).platform_student_id ?? null,
            currentPlanVersion: data.current_curriculum_version ?? null,
            lastLessonSent: (data as any).last_lesson_sent ?? null,
            active: Boolean((data as any).active ?? true),
          },
        ];
      }
    } else {
      const { data, error } = await supabaseClient
        .from('students')
        .select('id, name, timezone, platform_student_id, current_curriculum_version, active, last_lesson_sent')
        .eq('active', true);
      if (error) {
        sendError(res, 500, `Failed to load active students: ${error.message}`);
        return;
      }
      students = (data ?? []).map((row: any) => ({
        studentId: row.id,
        name: row.name ?? null,
        timezone: row.timezone ?? null,
        platformStudentId: row.platform_student_id ?? null,
        currentPlanVersion: row.current_curriculum_version ?? null,
        lastLessonSent: row.last_lesson_sent ?? null,
        active: true,
      }));
    }

    if (students.length === 0) {
      res.status(200).json({
        generatedAt: new Date().toISOString(),
        lookbackDays,
        roster: [],
        totals: {
          activeStudents: 0,
          openDrafts: 0,
          flaggedStudents: 0,
          idleStudents: 0,
        },
        alerts: [],
      });
      return;
    }

    const studentIds = students.map((student) => student.studentId);

    const [draftRows, progressRows, performanceRows, dispatchRows] = await Promise.all([
      supabaseClient
        .from('study_plan_drafts')
        .select('student_id, version, study_plan, created_at')
        .in('student_id', studentIds),
      supabaseClient
        .from('study_plan_progress')
        .select('student_id, status, last_decision_at')
        .in('student_id', studentIds),
      supabaseClient
        .from('daily_performance')
        .select('student_id, date, avg_correctness, avg_confidence, units')
        .in('student_id', studentIds)
        .gte('date', sinceDate),
      supabaseClient
        .from('platform_dispatches')
        .select('student_id, remaining_minutes, total_minutes, last_dispatched_at')
        .in('student_id', studentIds),
    ]);

    for (const response of [draftRows, progressRows, performanceRows, dispatchRows]) {
      if (response.error) {
        sendError(res, 500, response.error.message);
        return;
      }
    }

    const draftsByStudent = new Map<string, any[]>();
    for (const row of draftRows.data ?? []) {
      if (!draftsByStudent.has(row.student_id)) draftsByStudent.set(row.student_id, []);
      draftsByStudent.get(row.student_id)!.push(row);
    }

    const progressByStudent = new Map<string, Record<string, number>>();
    const lastDecisionByStudent = new Map<string, string | null>();
    for (const row of progressRows.data ?? []) {
      const status = (row.status ?? 'unknown') as string;
      if (!progressByStudent.has(row.student_id)) {
        progressByStudent.set(row.student_id, {});
      }
      const bucket = progressByStudent.get(row.student_id)!;
      bucket[status] = (bucket[status] ?? 0) + 1;
      const lastDecision = row.last_decision_at ?? null;
      if (lastDecision) {
        const previous = lastDecisionByStudent.get(row.student_id);
        if (!previous || previous < lastDecision) {
          lastDecisionByStudent.set(row.student_id, lastDecision);
        }
      }
    }

    const performanceByStudent = new Map<
      string,
      {
        sessions: number;
        totalUnits: number;
        avgCorrectness: number | null;
        avgConfidence: number | null;
        lastActivity: string | null;
      }
    >();
    for (const row of performanceRows.data ?? []) {
      if (!performanceByStudent.has(row.student_id)) {
        performanceByStudent.set(row.student_id, {
          sessions: 0,
          totalUnits: 0,
          avgCorrectness: null,
          avgConfidence: null,
          lastActivity: null,
        });
      }
      const bucket = performanceByStudent.get(row.student_id)!;
      bucket.sessions += 1;
      bucket.totalUnits += typeof row.units === 'number' ? row.units : 0;
      if (typeof row.avg_correctness === 'number') {
        bucket.avgCorrectness = bucket.avgCorrectness == null
          ? row.avg_correctness
          : (bucket.avgCorrectness + row.avg_correctness) / 2;
      }
      if (typeof row.avg_confidence === 'number') {
        bucket.avgConfidence = bucket.avgConfidence == null
          ? row.avg_confidence
          : (bucket.avgConfidence + row.avg_confidence) / 2;
      }
      const activityDate = row.date ? String(row.date) : null;
      if (activityDate) {
        const previous = bucket.lastActivity;
        if (!previous || previous < activityDate) {
          bucket.lastActivity = activityDate;
        }
      }
    }

    const dispatchByStudent = new Map<
      string,
      {
        remainingMinutes: number;
        totalMinutes: number;
        lastDispatchedAt: string | null;
      }
    >();
    for (const row of dispatchRows.data ?? []) {
      if (!dispatchByStudent.has(row.student_id)) {
        dispatchByStudent.set(row.student_id, {
          remainingMinutes: 0,
          totalMinutes: 0,
          lastDispatchedAt: null,
        });
      }
      const bucket = dispatchByStudent.get(row.student_id)!;
      if (typeof row.remaining_minutes === 'number') {
        bucket.remainingMinutes += row.remaining_minutes;
      }
      if (typeof row.total_minutes === 'number') {
        bucket.totalMinutes += row.total_minutes;
      }
      if (row.last_dispatched_at) {
        if (!bucket.lastDispatchedAt || bucket.lastDispatchedAt < row.last_dispatched_at) {
          bucket.lastDispatchedAt = row.last_dispatched_at;
        }
      }
    }

    const roster = students.map((student) => {
      const drafts = draftsByStudent.get(student.studentId) ?? [];
      const progress = progressByStudent.get(student.studentId) ?? {};
      const performance = performanceByStudent.get(student.studentId) ?? {
        sessions: 0,
        totalUnits: 0,
        avgCorrectness: null,
        avgConfidence: null,
        lastActivity: null,
      };
      const dispatchSummary = dispatchByStudent.get(student.studentId) ?? {
        remainingMinutes: 0,
        totalMinutes: 0,
        lastDispatchedAt: null,
      };

      const alerts: StudentAlert[] = [];
      if (!student.currentPlanVersion) {
        alerts.push({ type: 'missing_plan', severity: 'critical', message: 'No active study plan.' });
      }
      if (performance.sessions === 0) {
        alerts.push({
          type: 'no_recent_activity',
          severity: 'warning',
          message: `No platform activity in the last ${lookbackDays} days.`,
        });
      }
      if (drafts.length > 0) {
        alerts.push({
          type: 'draft_pending',
          severity: 'info',
          message: `${drafts.length} draft${drafts.length > 1 ? 's' : ''} awaiting review.`,
        });
      }
      if (dispatchSummary.remainingMinutes > dispatchSummary.totalMinutes * 0.75 && dispatchSummary.totalMinutes > 0) {
        alerts.push({
          type: 'high_remaining_minutes',
          severity: 'warning',
          message: 'Most assigned minutes are still unsent on the platform.',
        });
      }

      const masterySummary = {
        mastered: progress.mastered ?? 0,
        near_mastery: progress.near_mastery ?? 0,
        in_progress: progress.in_progress ?? 0,
        not_started: progress.not_started ?? 0,
      };

      return {
        studentId: student.studentId,
        name: student.name,
        timezone: student.timezone,
        platformStudentId: student.platformStudentId,
        currentPlanVersion: student.currentPlanVersion,
        openDraftCount: drafts.length,
        drafts: drafts
          .map((draft) => ({
            version: draft.version,
            createdAt: draft.created_at ?? null,
            focus:
              typeof draft.study_plan === 'object' && draft.study_plan && 'objectives' in draft.study_plan
                ? (draft.study_plan as any).objectives ?? null
                : null,
          }))
          .slice(0, 5),
        mastery: masterySummary,
        recentPerformance: {
          sessions: performance.sessions,
          totalUnits: performance.totalUnits,
          avgCorrectness: performance.avgCorrectness,
          avgConfidence: performance.avgConfidence,
          lastActivity: performance.lastActivity,
        },
        dispatch: {
          remainingMinutes: dispatchSummary.remainingMinutes,
          totalMinutes: dispatchSummary.totalMinutes,
          lastDispatchedAt: dispatchSummary.lastDispatchedAt,
        },
        lastDecisionAt: lastDecisionByStudent.get(student.studentId) ?? null,
        alerts,
      };
    });

    const totals = {
      activeStudents: roster.length,
      openDrafts: roster.reduce((sum, student) => sum + student.openDraftCount, 0),
      flaggedStudents: roster.filter((student) => student.alerts.some((alert) => alert.severity !== 'info')).length,
      idleStudents: roster.filter((student) => student.recentPerformance.sessions === 0).length,
    };

    const alerts = roster
      .flatMap((student) =>
        student.alerts.map((alert) => ({
          studentId: student.studentId,
          studentName: student.name,
          type: alert.type,
          severity: alert.severity,
          message: alert.message,
        })),
      )
      .sort((a, b) => {
        const severityRank = { critical: 0, warning: 1, info: 2 } as Record<string, number>;
        const diff = severityRank[a.severity] - severityRank[b.severity];
        if (diff !== 0) return diff;
        return (a.studentName ?? '').localeCompare(b.studentName ?? '');
      });

    let selectedStudentDetail: any = null;
    if (studentIdFilter && roster.length === 1) {
      const student = roster[0];
      const platformId = toNumber(student.platformStudentId);
      let curriculums: unknown = null;
      let todaySchedule: unknown = null;
      if (platformId !== null) {
        try {
          curriculums = await platformJsonFn(
            `/student-curriculums?studentId=${platformId}&includeStopped=true&includeNoRemainingDuration=true`,
          );
        } catch (err) {
          console.warn('Failed to fetch student curriculums from platform', err);
        }
        try {
          const today = new Date().toISOString().slice(0, 10);
          todaySchedule = await platformJsonFn(
            `/study-schedules?studentId=${platformId}&scheduledDate=${today}`,
          ).catch(() => null);
        } catch (err) {
          console.warn('Failed to fetch today schedules from platform', err);
        }
      }
      selectedStudentDetail = {
        ...student,
        platform:
          curriculums || todaySchedule
            ? {
                curriculums,
                todaySchedule,
              }
            : null,
      };
    }

    res.status(200).json({
      generatedAt: new Date().toISOString(),
      lookbackDays,
      roster,
      totals,
      alerts,
      selectedStudent: selectedStudentDetail,
    });
  } catch (err: any) {
    console.error('dashboard handler failed', err);
    sendError(res, 500, err?.message ?? 'dashboard_failed');
  }
  };
}

const defaultHandler = createDashboardHandler({
  supabaseClient: supabase,
  platformJson,
});

export default defaultHandler;

export const config = {
  api: {
    bodyParser: false,
  },
};
