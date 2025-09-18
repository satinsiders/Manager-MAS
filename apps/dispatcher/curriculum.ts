import { supabase } from '../../packages/shared/supabase';
import { platformFetch, platformJson } from '../../packages/shared/platform';
import { upsertDispatchMirror, upsertCatalogFromDispatches, mapStudentCurriculums } from '../platform-sync';
import type { PlatformDispatch } from '../platform-sync';

async function findQuestionTypeId(qtype: string, client = supabase): Promise<string | null> {
  const { data: qt } = await client
    .from('question_types')
    .select('id, specific_type, canonical_path')
    .ilike('specific_type', qtype)
    .limit(1);
  let qid: string | undefined = qt && qt.length > 0 ? (qt[0] as any).id : undefined;
  if (!qid) {
    const { data: qt2 } = await client
      .from('question_types')
      .select('id, canonical_path')
      .ilike('canonical_path', `%> ${qtype}`)
      .limit(1);
    qid = qt2 && qt2.length > 0 ? (qt2[0] as any).id : undefined;
  }
  return qid ?? null;
}

export async function listActiveCurriculumIds(qtype: string, client = supabase): Promise<string[]> {
  const qid = await findQuestionTypeId(qtype, client);
  if (!qid) return [];
  const { data: catalog } = await client
    .from('curriculum_catalog')
    .select('external_curriculum_id, active')
    .eq('question_type_id', qid)
    .eq('active', true);
  return (catalog ?? []).map((c: any) => c.external_curriculum_id).filter(Boolean);
}

export async function resolvePlatformCurriculumId(qtype?: string, client = supabase): Promise<string | null> {
  if (!qtype) return null;
  const ids = await listActiveCurriculumIds(qtype, client);
  return ids[0] ?? null;
}

export async function syncStudentCurriculums(
  studentId: string,
  platformStudentId: string
): Promise<PlatformDispatch[]> {
  try {
    const response = await platformJson<any>(
      `/student-curriculums?studentId=${encodeURIComponent(platformStudentId)}&includeStopped=true&includeNoRemainingDuration=true`
    );
    const list: any[] = Array.isArray(response) ? response : response?.items ?? [];
    const rows = mapStudentCurriculums(list, studentId);
    if (rows.length) {
      await upsertDispatchMirror(rows);
      await upsertCatalogFromDispatches(rows);
    }
    return rows;
  } catch (err) {
    console.error(`failed to sync student curriculums for ${studentId}`, err);
    return [];
  }
}

export async function ensureStudentCurriculumRecord(
  studentId: string,
  platformStudentId: string,
  curriculumId: string
): Promise<{ studentCurriculumId: string | null; remainingMinutes: number | null }> {
  const query = await supabase
    .from('platform_dispatches')
    .select('student_curriculum_id, remaining_minutes, ingested_at')
    .eq('student_id', studentId)
    .eq('external_curriculum_id', curriculumId)
    .order('ingested_at', { ascending: false })
    .limit(1);
  const existing = query.data?.[0] as any;
  if (existing?.student_curriculum_id) {
    return {
      studentCurriculumId: existing.student_curriculum_id,
      remainingMinutes: existing.remaining_minutes ?? null,
    };
  }
  await syncStudentCurriculums(studentId, platformStudentId);
  const refreshed = await supabase
    .from('platform_dispatches')
    .select('student_curriculum_id, remaining_minutes, ingested_at')
    .eq('student_id', studentId)
    .eq('external_curriculum_id', curriculumId)
    .order('ingested_at', { ascending: false })
    .limit(1);
  const row = refreshed.data?.[0] as any;
  if (!row) {
    return { studentCurriculumId: null, remainingMinutes: null };
  }
  return {
    studentCurriculumId: row.student_curriculum_id ?? null,
    remainingMinutes: row.remaining_minutes ?? null,
  };
}

export function normalizePlatformId(value: string) {
  const num = Number(value);
  return Number.isFinite(num) ? num : value;
}

export async function assignCurriculum(
  candidateId: string,
  studentId: string,
  platformStudentId: string
): Promise<{ success: boolean; status: 'sent' | 'failed' }> {
  try {
    const assignResp = await platformFetch('/courses', {
      method: 'POST',
      body: JSON.stringify({
        curriculumId: normalizePlatformId(candidateId),
        studentId: normalizePlatformId(platformStudentId),
      }),
    });
    const status: 'sent' | 'failed' = assignResp.ok ? 'sent' : 'failed';
    if (assignResp.ok) {
      await syncStudentCurriculums(studentId, platformStudentId);
    }
    return { success: assignResp.ok, status };
  } catch (err) {
    console.error('platform assignment failed', err);
    return { success: false, status: 'failed' };
  }
}
