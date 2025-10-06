import { platformJson } from '../../../../packages/shared/platform';
import { supabase } from '../../../../packages/shared/supabase';
import { refreshStudentsByIds } from '../../../platform-sync/refresh';
import { buildQuery, toNumber, isKnownMutationSuccess } from '../utils';
import type { OperationMap } from './types';
import {
  parseBool,
  ensureStudentByPlatformId,
  ensurePerformanceData,
} from './shared/student';

async function confirmLearningVolume(
  studentId: number | null,
  scheduledDate: string,
  studentCurriculumId: number,
  signal?: AbortSignal,
) {
  if (!studentId) return null;
  const query = buildQuery({ studentId, scheduledDate, studentCurriculumId });
  const data = await platformJson(`/study-schedules${query}`, { signal });
  let schedule: any = null;
  if (Array.isArray(data)) {
    schedule = data.find((item) => {
      const scheduleStudentCurriculumId = toNumber(
        (item as any)?.studentCurriculumId ??
          (item as any)?.student_curriculum_id ??
          (item as any)?.studySchedule?.studentCurriculumId ??
          (item as any)?.studySchedule?.student_curriculum_id,
      );
      return scheduleStudentCurriculumId === studentCurriculumId;
    });
  }
  return { data, schedule };
}

function normalizeScheduledDate(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return String(value[0] ?? '');
  if (value != null) return String(value);
  return '';
}

const scheduleHandlers: OperationMap = {
  async list_study_schedules(args) {
    const studentIdRaw = args.studentId ?? args.student_id;
    const studentId = toNumber(studentIdRaw);
    if (studentId === null) {
      if (studentIdRaw === undefined || studentIdRaw === null || studentIdRaw === '') {
        throw new Error('studentId is required');
      }
      throw new Error('studentId must be a number.');
    }

    const scheduledDate = normalizeScheduledDate(args.scheduledDate ?? args.scheduled_date);
    if (!scheduledDate) {
      throw new Error('scheduledDate is required and must be in YYYY-MM-DD format');
    }

    const studentRow = await ensureStudentByPlatformId(studentId);
    await ensurePerformanceData(studentRow.id, scheduledDate);

    let { data: performanceRows } = await supabase
      .from('daily_performance')
      .select('external_curriculum_id, date, avg_correctness, avg_confidence, units, bundle_ref')
      .eq('student_id', studentRow.id)
      .eq('date', scheduledDate);

    if (!performanceRows || performanceRows.length === 0) {
      await refreshStudentsByIds([studentRow.id]);
      ({ data: performanceRows } = await supabase
        .from('daily_performance')
        .select('external_curriculum_id, date, avg_correctness, avg_confidence, units, bundle_ref')
        .eq('student_id', studentRow.id)
        .eq('date', scheduledDate));
    }

    const { data: unitRows } = await supabase
      .from('daily_performance_units')
      .select(
        'platform_curriculum_id, lesson_id, unit_id, unit_seq, is_completed, is_correct, confidence, consecutive_correct_count, raw',
      )
      .eq('student_id', studentRow.id)
      .eq('scheduled_date', scheduledDate);

    const curriculumFilter = args.studentCurriculumId ?? args.student_curriculum_id;
    const filterIsCorrect = parseBool(args.isCorrect);
    const confidenceFilter =
      typeof args.confidence === 'number'
        ? args.confidence
        : typeof args.confidence === 'string'
        ? Number(args.confidence)
        : undefined;

    if (curriculumFilter) {
      performanceRows = (performanceRows ?? []).filter(
        (row: any) => String(row.external_curriculum_id) === String(curriculumFilter),
      );
    }

    const platformId = studentRow.platform_student_id ? Number(studentRow.platform_student_id) : null;

    return (performanceRows ?? []).map((row: any, index: number) => {
      const curriculumId = row.external_curriculum_id;
      const lessonsMap = new Map<string, any[]>();
      for (const unit of unitRows ?? []) {
        if (unit.platform_curriculum_id !== curriculumId) continue;
        const key = unit.lesson_id ?? curriculumId ?? `lesson-${index}`;
        if (!lessonsMap.has(key)) lessonsMap.set(key, []);
        lessonsMap.get(key)!.push(unit);
      }

      const studyLessons = Array.from(lessonsMap.entries())
        .map(([lessonId, units]) => ({ lessonId, units }))
        .map(({ lessonId, units }) => ({
          lessonId,
          units: units.filter((unit) => {
            if (filterIsCorrect !== undefined && unit.is_correct !== filterIsCorrect) return false;
            if (confidenceFilter !== undefined && unit.confidence != null && unit.confidence < confidenceFilter)
              return false;
            return true;
          }),
        }))
        .filter(({ units }) => units.length > 0)
        .map(({ lessonId, units }) => ({
          id: lessonId,
          lessonId,
          isFinalSubmitted: false,
          isAssignment: false,
          consecutiveCorrectCount:
            units.find((u) => typeof u.consecutive_correct_count === 'number')?.consecutive_correct_count ?? null,
          lesson: {
            id: lessonId,
            title: lessonId,
            lessonType: null,
          },
          studyUnits: units.map((unit) => ({
            id: unit.unit_id ?? `${lessonId}-${unit.unit_seq ?? 0}`,
            unitId: unit.unit_id ?? null,
            unitSeq: unit.unit_seq ?? null,
            isCompleted: unit.is_completed ?? null,
            isCorrect: unit.is_correct ?? null,
            confidence: unit.confidence ?? null,
            unit: {
              id: unit.unit_id ?? null,
              title: unit.unit_id ?? null,
              unitType: null,
              difficultyType: null,
            },
          })),
        }));

      const totalUnits = (row.units ?? 0) as number;
      return {
        studySchedule: {
          id: `${studentRow.id}-${scheduledDate}-${curriculumId}-${index}`,
          scheduledDate,
          totalDuration: totalUnits,
          student: {
            id: platformId,
            studySchedule: studentRow.study_schedule ?? null,
            user: {
              id: platformId,
              name: studentRow.name ?? 'Student',
            },
          },
        },
        studyLessons,
        metrics: {
          avg_correctness: row.avg_correctness ?? null,
          avg_confidence: row.avg_confidence ?? null,
        },
      };
    });
  },

  async set_learning_volume(args, signal) {
    const studentCurriculumIdRaw = args.studentCurriculumId ?? args.student_curriculum_id;
    const studentCurriculumId = toNumber(studentCurriculumIdRaw);
    if (studentCurriculumId === null) {
      if (studentCurriculumIdRaw === undefined || studentCurriculumIdRaw === null || studentCurriculumIdRaw === '') {
        throw new Error('studentCurriculumId is required');
      }
      throw new Error('studentCurriculumId must be a number.');
    }

    const scheduledDate = args.scheduledDate ?? args.scheduled_date;
    if (!scheduledDate) {
      throw new Error('scheduledDate is required');
    }

    const durationRaw = args.duration;
    const duration = toNumber(durationRaw);
    if (duration === null) {
      if (durationRaw === undefined || durationRaw === null || durationRaw === '') {
        throw new Error('duration is required');
      }
      throw new Error('duration must be a number.');
    }

    const payload = {
      studentCurriculumId,
      scheduledDate: String(scheduledDate),
      duration,
    };
    const studentId = toNumber(args.studentId ?? args.student_id);

    try {
      const result = await platformJson('/api/study-schedules/learning-volumes', {
        method: 'POST',
        body: JSON.stringify(payload),
        signal,
      });
      return {
        status: 'scheduled',
        studentCurriculumId: payload.studentCurriculumId,
        scheduledDate: payload.scheduledDate,
        minutes: payload.duration,
        studentId: studentId ?? undefined,
        platformResponse: result ?? null,
      };
    } catch (err: any) {
      const message = err?.message ?? String(err);
      if (isKnownMutationSuccess(message)) {
        try {
          const confirmation = await confirmLearningVolume(
            studentId,
            payload.scheduledDate,
            payload.studentCurriculumId,
            signal,
          );
          if (confirmation && confirmation.schedule) {
            return {
              status: 'scheduled_with_warning',
              warning: message,
              studentCurriculumId: payload.studentCurriculumId,
              scheduledDate: payload.scheduledDate,
              minutes: payload.duration,
              studentId: studentId ?? undefined,
              confirmation,
            };
          }
        } catch (verifyErr) {
          console.error('Verification after scheduling error failed', verifyErr);
        }
        return {
          status: 'warning',
          warning: message,
          studentCurriculumId: payload.studentCurriculumId,
          scheduledDate: payload.scheduledDate,
          minutes: payload.duration,
          studentId: studentId ?? undefined,
        };
      }
      throw err;
    }
  },
};

export default scheduleHandlers;
