import { supabase } from '../../../../packages/shared/supabase';
import { refreshAllStudents, refreshStudentsByIds } from '../../../platform-sync/refresh';
import { toNumber } from '../utils';
import type { OperationMap } from './types';
import {
  parseBool,
  mapStudentRowToResult,
  ensureStudentByPlatformId,
  ensureDispatchData,
  SupabaseStudent,
} from './shared/student';

const studentHandlers: OperationMap = {
  async list_students(args) {
    const onlyValid = parseBool(args.onlyValid);
    const builder = supabase
      .from('students')
      .select('id, name, platform_student_id, timezone, preferred_topics, active, study_schedule, email');
    if (onlyValid === true) {
      builder.eq('active', true);
    }

    let { data } = await builder;
    if (!data || data.length === 0) {
      await refreshAllStudents();
      ({ data } = await builder);
    }

    return (data ?? []).map((row) => mapStudentRowToResult(row as SupabaseStudent));
  },

  async list_student_curriculums(args) {
    const studentIdRaw = args.studentId ?? args.student_id;
    const studentId = toNumber(studentIdRaw);
    if (studentId === null) {
      if (studentIdRaw === undefined || studentIdRaw === null || studentIdRaw === '') {
        throw new Error('studentId is required');
      }
      throw new Error('studentId must be a number.');
    }

    const studentRow = await ensureStudentByPlatformId(studentId);
    await ensureDispatchData(studentRow.id);

    let { data } = await supabase
      .from('platform_dispatches')
      .select(
        'external_curriculum_id, student_curriculum_id, raw_title, total_minutes, remaining_minutes, first_dispatched_at, last_dispatched_at, ingested_at',
      )
      .eq('student_id', studentRow.id);

    if (!data || data.length === 0) {
      await refreshStudentsByIds([studentRow.id]);
      ({ data } = await supabase
        .from('platform_dispatches')
        .select(
          'external_curriculum_id, student_curriculum_id, raw_title, total_minutes, remaining_minutes, first_dispatched_at, last_dispatched_at, ingested_at',
        )
        .eq('student_id', studentRow.id));
    }

    const includeStopped = parseBool(args.includeStopped) ?? false;
    const includeNoRemainingDuration = parseBool(args.includeNoRemainingDuration) ?? false;
    const platformId = studentRow.platform_student_id ? Number(studentRow.platform_student_id) : null;

    const filtered = (data ?? []).filter((row: any) => {
      const isStopped = row.remaining_minutes === 0 || row.remaining_minutes === null;
      if (!includeStopped && isStopped) return false;
      if (!includeNoRemainingDuration && (row.remaining_minutes ?? 0) <= 0) return false;
      return true;
    });

    return filtered.map((row: any) => ({
      id: row.student_curriculum_id ?? row.external_curriculum_id,
      studentId: platformId,
      curriculumId: row.external_curriculum_id ? Number(row.external_curriculum_id) : null,
      title: row.raw_title ?? null,
      lessonTotalCount: null,
      isStopped: row.remaining_minutes === 0,
      stoppedAt: row.last_dispatched_at ?? null,
      createdAt: row.first_dispatched_at ?? null,
      totalDuration: row.total_minutes ?? null,
      remainingDuration: row.remaining_minutes ?? null,
    }));
  },
};

export default studentHandlers;
