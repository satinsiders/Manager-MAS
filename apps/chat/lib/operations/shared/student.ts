import { supabase } from '../../../../../packages/shared/supabase';
import { refreshAllStudents, refreshStudentsByIds } from '../../../../platform-sync/refresh';

export type SupabaseStudent = {
  id: string;
  platform_student_id: string | null;
  name: string | null;
  timezone?: string | null;
  preferred_topics?: string[] | null;
  active?: boolean | null;
  study_schedule?: string | null;
  email?: string | null;
};

export function parseBool(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
  }
  return undefined;
}

export async function fetchStudentByPlatformId(platformId: number): Promise<SupabaseStudent | null> {
  if (!Number.isFinite(platformId)) return null;
  const { data } = await supabase
    .from('students')
    .select('id, platform_student_id, name, timezone, preferred_topics, active, study_schedule, email')
    .eq('platform_student_id', String(platformId))
    .maybeSingle();
  return (data as SupabaseStudent | null) ?? null;
}

export async function ensureStudentByPlatformId(platformId: number): Promise<SupabaseStudent> {
  let student = await fetchStudentByPlatformId(platformId);
  if (!student) {
    await refreshAllStudents();
    student = await fetchStudentByPlatformId(platformId);
  }
  if (!student) {
    throw new Error(`Student with platform ID ${platformId} not found.`);
  }
  return student;
}

export async function ensureDispatchData(studentId: string) {
  const { count } = await supabase
    .from('platform_dispatches')
    .select('student_id', { count: 'exact', head: true })
    .eq('student_id', studentId);
  if (!count || count === 0) {
    await refreshStudentsByIds([studentId]);
  }
}

export async function ensurePerformanceData(studentId: string, date: string) {
  const { count } = await supabase
    .from('daily_performance')
    .select('student_id', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .eq('date', date);
  if (!count || count === 0) {
    await refreshStudentsByIds([studentId]);
  }
}

export function mapStudentRowToResult(row: SupabaseStudent) {
  const platformId = row.platform_student_id ? Number(row.platform_student_id) : null;
  return {
    id: platformId ?? row.id,
    name: row.name ?? 'Student',
    studySchedule: row.study_schedule ?? null,
    user: {
      id: platformId,
      name: row.name ?? 'Student',
      email: row.email ?? null,
    },
    isValid: row.active !== false,
    timezone: row.timezone ?? null,
    preferred_topics: row.preferred_topics ?? null,
    mas_student_id: row.id,
  };
}
