import { platformJson } from '../../../../packages/shared/platform';
import { supabase } from '../../../../packages/shared/supabase';
import { syncCurriculumCatalogFromApi } from '../../../platform-sync/catalog';
import { buildQuery, toNumber, isKnownMutationSuccess } from '../utils';
import type { OperationMap } from './types';

async function confirmAssignment(studentId: number, curriculumId: number, signal?: AbortSignal) {
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

const curriculumHandlers: OperationMap = {
  async list_curriculums(args) {
    const limit =
      typeof args.limit === 'number'
        ? args.limit
        : typeof args.limit === 'string'
        ? Number(args.limit)
        : 20;
    const page =
      typeof args.page === 'number'
        ? args.page
        : typeof args.page === 'string'
        ? Number(args.page)
        : 1;

    const take = Number.isFinite(limit) && limit > 0 ? limit : 20;
    const offset = Math.max(0, (Number.isFinite(page) ? page : 1) - 1) * take;
    let queryBuilder = supabase
      .from('curriculum_catalog')
      .select('external_curriculum_id, raw_title, question_type_id, subtype, ingested_at', { count: 'exact' })
      .order('raw_title', { ascending: true })
      .range(offset, offset + take - 1);

    if (args.search && typeof args.search === 'string' && args.search.trim()) {
      queryBuilder = queryBuilder.ilike('raw_title', `%${args.search.trim()}%`);
    }

    let { data } = await queryBuilder;
    if (!data || data.length === 0) {
      await syncCurriculumCatalogFromApi();
      ({ data } = await queryBuilder);
    }

    return (data ?? []).map((row: any) => ({
      id: row.external_curriculum_id,
      title: row.raw_title ?? null,
      question_type_id: row.question_type_id ?? null,
      subtype: row.subtype ?? null,
      createdAt: row.ingested_at ?? null,
    }));
  },

  async grant_student_course(args, signal) {
    const curriculumIdRaw = args.curriculumId ?? args.curriculum_id;
    const curriculumId = toNumber(curriculumIdRaw);
    if (curriculumId === null) {
      if (curriculumIdRaw === undefined || curriculumIdRaw === null || curriculumIdRaw === '') {
        throw new Error('curriculumId is required');
      }
      throw new Error('curriculumId must be a number.');
    }

    const studentIdRaw = args.studentId ?? args.student_id;
    const studentId = toNumber(studentIdRaw);
    if (studentId === null) {
      if (studentIdRaw === undefined || studentIdRaw === null || studentIdRaw === '') {
        throw new Error('studentId is required');
      }
      throw new Error('studentId must be a number.');
    }

    const payload = { curriculumId, studentId };

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

export default curriculumHandlers;
