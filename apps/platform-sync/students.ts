import { randomUUID } from 'crypto';
import { supabase } from '../../packages/shared/supabase';
import { callWithRetry } from '../../packages/shared/retry';
import { SUPERFASTSAT_API_TOKEN, SUPERFASTSAT_API_URL } from '../../packages/shared/config';

const DEFAULT_TIMEZONE = process.env.DEFAULT_STUDENT_TIMEZONE ?? 'UTC';

export async function syncStudentsRoster(
  client = supabase,
  callFn: typeof callWithRetry = callWithRetry
) {
  const baseUrl = SUPERFASTSAT_API_URL.replace(/\/$/, '');
  const studentsUrl = process.env.PLATFORM_STUDENTS_URL ?? `${baseUrl}/students`;
  const resp = await callFn(
    `${studentsUrl}?onlyValid=false`,
    { headers: { Authorization: `Bearer ${SUPERFASTSAT_API_TOKEN}` } },
    'platform-sync',
    'students'
  );
  if (!resp) return;
  let list: any[] = [];
  try {
    const body: any = await resp.json();
    list = Array.isArray(body) ? body : body?.items ?? [];
  } catch {
    list = [];
  }
  for (const entry of list) {
    const platformStudentId = entry?.id;
    if (platformStudentId == null) continue;
    const name = entry?.user?.name ?? null;
    const email = entry?.user?.email ?? null;
    const studySchedule = entry?.studySchedule ?? null;
    const isValid = entry?.isValid !== false;
    const platformId = String(platformStudentId);

    const { data: existing } = await client
      .from('students')
      .select('id, platform_student_id, name')
      .eq('platform_student_id', platformId)
      .limit(1);
    let studentId: string;
    if (existing && existing.length > 0) {
      const row: any = existing[0];
      studentId = row.id;
      await client
        .from('students')
        .update({
          name: name ?? row.name ?? `Student ${platformId}`,
          active: isValid,
        })
        .eq('id', studentId);
    } else {
      studentId = randomUUID();
      const insertPayload: any = {
        id: studentId,
        name: name ?? `Student ${platformId}`,
        timezone: DEFAULT_TIMEZONE,
        current_curriculum_version: null,
        platform_student_id: platformId,
        active: isValid,
      };
      await client.from('students').insert(insertPayload);
    }
  }
}
