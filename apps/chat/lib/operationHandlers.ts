import { platformJson } from '../../../packages/shared/platform';
import { buildQuery, toNumber, isKnownMutationSuccess } from './utils';

export async function confirmAssignment(studentId: number, curriculumId: number, signal?: AbortSignal) {
  const query = buildQuery({
    studentId,
    includeStopped: true,
    includeNoRemainingDuration: true,
  });
  const data = await platformJson(`/student-curriculums${query}`, { signal });
  let assignment: any = null;
  if (Array.isArray(data)) {
    assignment = data.find((item) => {
      const id = toNumber((item as any)?.curriculumId ?? (item as any)?.curriculum_id);
      return id === curriculumId;
    });
  }
  return { data, assignment };
}

export async function confirmLearningVolume(
  studentId: number | null,
  scheduledDate: string,
  studentCurriculumId: number,
  signal?: AbortSignal,
) {
  if (!studentId) return null;
  const query = buildQuery({
    studentId,
    scheduledDate,
    studentCurriculumId,
  });
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

export const operationHandlers: Record<string, (args: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown>> = {
  async list_students(args, signal) {
    const onlyValid =
      typeof args.onlyValid === 'boolean'
        ? args.onlyValid
        : typeof args.onlyValid === 'string'
        ? args.onlyValid.toLowerCase() === 'true'
        : undefined;
    const query = buildQuery({
      onlyValid,
    });
    return platformJson(`/students${query}`, { signal });
  },
  async list_student_curriculums(args, signal) {
    const studentId = args.studentId ?? args.student_id;
    if (studentId === undefined || studentId === null || studentId === '') {
      throw new Error('studentId is required');
    }
    const query = buildQuery({
      studentId,
      date: args.date,
      includeStopped:
        typeof args.includeStopped === 'boolean'
          ? args.includeStopped
          : typeof args.includeStopped === 'string'
          ? args.includeStopped.toLowerCase() === 'true'
          : undefined,
      includeNoRemainingDuration:
        typeof args.includeNoRemainingDuration === 'boolean'
          ? args.includeNoRemainingDuration
          : typeof args.includeNoRemainingDuration === 'string'
          ? args.includeNoRemainingDuration.toLowerCase() === 'true'
          : undefined,
    });
    return platformJson(`/student-curriculums${query}`, { signal });
  },
  async list_study_schedules(args, signal) {
    const studentId = args.studentId ?? args.student_id;
    if (studentId === undefined || studentId === null || studentId === '') {
      throw new Error('studentId is required');
    }
    const scheduledDate = args.scheduledDate ?? args.scheduled_date;
    if (!scheduledDate) {
      throw new Error('scheduledDate is required and must be in YYYY-MM-DD format');
    }
    const query = buildQuery({
      studentId,
      scheduledDate,
      studentCurriculumId: args.studentCurriculumId ?? args.student_curriculum_id,
      excludeLecture:
        typeof args.excludeLecture === 'boolean'
          ? args.excludeLecture
          : typeof args.excludeLecture === 'string'
          ? args.excludeLecture.toLowerCase() === 'true'
          : undefined,
      isCorrect:
        typeof args.isCorrect === 'boolean'
          ? args.isCorrect
          : typeof args.isCorrect === 'string'
          ? args.isCorrect.toLowerCase() === 'true'
          : undefined,
      confidence: args.confidence,
      subject: args.subject,
      domainId: args.domainId ?? args.domain_id,
      skillId: args.skillId ?? args.skill_id,
      difficultyType: args.difficultyType ?? args.difficulty_type,
    });
    return platformJson(`/study-schedules${query}`, { signal });
  },
  async list_curriculums(args, signal) {
    const query = buildQuery({
      page: args.page,
      limit: args.limit,
      search: args.search,
    });
    return platformJson(`/curriculums${query}`, { signal });
  },
  async set_learning_volume(args, signal) {
    const studentCurriculumIdRaw = args.studentCurriculumId ?? args.student_curriculum_id;
    if (studentCurriculumIdRaw === undefined || studentCurriculumIdRaw === null || studentCurriculumIdRaw === '') {
      throw new Error('studentCurriculumId is required');
    }
    const scheduledDate = args.scheduledDate ?? args.scheduled_date;
    if (!scheduledDate) {
      throw new Error('scheduledDate is required');
    }
    const durationRaw = args.duration;
    if (durationRaw === undefined || durationRaw === null || durationRaw === '') {
      throw new Error('duration is required');
    }
    const payload = {
      studentCurriculumId: Number(studentCurriculumIdRaw),
      scheduledDate: String(scheduledDate),
      duration: Number(durationRaw),
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
  async grant_student_course(args, signal) {
    const curriculumIdRaw = args.curriculumId ?? args.curriculum_id;
    if (curriculumIdRaw === undefined || curriculumIdRaw === null || curriculumIdRaw === '') {
      throw new Error('curriculumId is required');
    }
    const studentIdRaw = args.studentId ?? args.student_id;
    if (studentIdRaw === undefined || studentIdRaw === null || studentIdRaw === '') {
      throw new Error('studentId is required');
    }
    const payload = {
      curriculumId: Number(curriculumIdRaw),
      studentId: Number(studentIdRaw),
    };
    try {
      const responseBody = await platformJson('/api/courses', {
        method: 'POST',
        body: JSON.stringify(payload),
        signal,
      });
      return {
        status: 'assigned',
        studentId: payload.studentId,
        curriculumId: payload.curriculumId,
        platformResponse: responseBody ?? null,
      };
    } catch (err: any) {
      const message = err?.message ?? String(err);
      if (isKnownMutationSuccess(message)) {
        try {
          const confirmation = await confirmAssignment(payload.studentId, payload.curriculumId, signal);
          if (confirmation.assignment) {
            return {
              status: 'assigned_with_warning',
              warning: message,
              studentId: payload.studentId,
              curriculumId: payload.curriculumId,
              confirmation,
            };
          }
        } catch (verifyErr) {
          console.error('Verification after assignment error failed', verifyErr);
        }
        return {
          status: 'warning',
          warning: message,
          studentId: payload.studentId,
          curriculumId: payload.curriculumId,
        };
      }
      throw err;
    }
  },
};

export default operationHandlers;
