import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../packages/shared/supabase';
import { createHash } from 'crypto';
import { SUPERFASTSAT_API_URL } from '../../packages/shared/config';
import { platformFetch } from '../../packages/shared/platform';
import {
  assignCurriculum,
  ensureStudentCurriculumRecord,
  listActiveCurriculumIds,
  normalizePlatformId,
  resolvePlatformCurriculumId,
  syncStudentCurriculums,
} from './curriculum';
import { selectUnits as selectUnitsImpl } from './selection';

export { selectUnits } from './selection';
export {
  assignCurriculum,
  ensureStudentCurriculumRecord,
  listActiveCurriculumIds,
  normalizePlatformId,
  resolvePlatformCurriculumId,
  syncStudentCurriculums,
} from './curriculum';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { student_id, minutes = 0, units: presetUnits, next_lesson_id, decision_id } =
    req.body as {
      student_id: string;
      minutes?: number;
      units?: any[];
      next_lesson_id?: string;
      decision_id?: string;
    };
  let requestedMinutes = minutes || 0;

  try {
    const { data: student } = await supabase
      .from('students')
      .select('current_curriculum_version, platform_student_id')
      .eq('id', student_id)
      .single();

    if (!student) throw new Error('student not found');
    const platformStudentId = student.platform_student_id ?? student_id;

    const { data: plan } = await supabase
      .from('study_plans')
      .select('id, study_plan')
      .eq('student_id', student_id)
      .eq('version', student.current_curriculum_version)
      .single();

    if (!plan) throw new Error('study plan not found');

    let selected: { units: any[]; total: number; lastLessonId?: string } = {
      units: presetUnits ?? [],
      total: 0,
      lastLessonId: undefined,
    };

    if (!presetUnits) {
      selected = await selectUnitsImpl(plan.study_plan, minutes);
    } else {
      selected.total = presetUnits.reduce(
        (sum, u: any) => sum + (Number(u.duration_minutes) || 0),
        0
      );
      if (presetUnits.length > 0) {
        const lastUnit = presetUnits[presetUnits.length - 1];
        selected.lastLessonId = lastUnit.lesson_id || lastUnit.lessonId;
      }
    }

    let question_type: string | undefined;
    if (selected.lastLessonId) {
      const { data: lesson } = await supabase
        .from('lessons')
        .select('topic')
        .eq('id', selected.lastLessonId)
        .single();
      question_type = lesson?.topic ?? undefined;
    }
    // No metadata fallback; question type derives from curriculum title (lesson topic)

    let status = 'failed';
    let dispatchLogId: string | undefined;
    let platform_curriculum_id: string | null = null;
    let platform_student_curriculum_id: string | null = null;
    let platform_bundle_ref: string | null = null;
    let actual_minutes: number | null = null;

    if (!presetUnits && requestedMinutes > 0) {
      platform_curriculum_id = await resolvePlatformCurriculumId(question_type);
      let remainingMinutes: number | null = null;

      if (platform_curriculum_id) {
        const record = await ensureStudentCurriculumRecord(student_id, platformStudentId, platform_curriculum_id);
        platform_student_curriculum_id = record.studentCurriculumId;
        if (typeof record.remainingMinutes === 'number') {
          remainingMinutes = record.remainingMinutes;
          if (remainingMinutes <= 0) {
            platform_curriculum_id = null;
            platform_student_curriculum_id = null;
          } else if (remainingMinutes < requestedMinutes) {
            requestedMinutes = remainingMinutes;
          }
        } else if (!platform_student_curriculum_id) {
          platform_curriculum_id = null;
        }
      }

      if (!platform_curriculum_id && question_type) {
        const extIds = await listActiveCurriculumIds(question_type);
        if (extIds.length > 0) {
          const { data: existing } = await supabase
            .from('platform_dispatches')
            .select('external_curriculum_id')
            .eq('student_id', student_id);
          const existingSet = new Set((existing ?? []).map((e: any) => e.external_curriculum_id));
          const candidate = extIds.find((id) => !existingSet.has(id)) ?? extIds[0];
          if (candidate) {
            const assignment = await assignCurriculum(candidate, student_id, platformStudentId);
            if (assignment.success) {
              const record = await ensureStudentCurriculumRecord(student_id, platformStudentId, candidate);
              platform_curriculum_id = candidate;
              platform_student_curriculum_id = record.studentCurriculumId;
              if (typeof record.remainingMinutes === 'number') {
                remainingMinutes = record.remainingMinutes;
                if (remainingMinutes > 0 && remainingMinutes < requestedMinutes) {
                  requestedMinutes = remainingMinutes;
                }
              }
            }
            try {
              await supabase
                .from('mas_actions')
                .insert({
                  decision_id: decision_id ?? null,
                  action_type: 'assign_curriculum',
                  request: { student_id, platform_student_id: platformStudentId, curriculum_id: candidate },
                  status: assignment.status,
                  response: {},
                  platform_curriculum_id: candidate,
                  platform_student_curriculum_id,
                });
            } catch {
              /* ignore */
            }
          }
        }
      }

      if (platform_curriculum_id && !platform_student_curriculum_id) {
        const record = await ensureStudentCurriculumRecord(student_id, platformStudentId, platform_curriculum_id);
        platform_student_curriculum_id = record.studentCurriculumId;
        if (typeof record.remainingMinutes === 'number' && record.remainingMinutes > 0 && record.remainingMinutes < requestedMinutes) {
          requestedMinutes = record.remainingMinutes;
        }
      }

      if (platform_curriculum_id && platform_student_curriculum_id) {
        const scheduledDate = new Date().toISOString().slice(0, 10);
        let response: globalThis.Response | null = null;
        try {
          response = await platformFetch('/study-schedules/learning-volumes', {
            method: 'POST',
            body: JSON.stringify({
              studentCurriculumId: normalizePlatformId(platform_student_curriculum_id),
              scheduledDate,
              duration: requestedMinutes,
            }),
          });
        } catch (err) {
          console.error('platform learning volume call failed', err);
        }
        if (response) {
          status = response.ok ? 'sent' : 'failed';
          platform_bundle_ref = null;
          actual_minutes = response.ok ? requestedMinutes : null;
          if (!response.ok) {
            const errText = await response.text().catch(() => '');
            console.error('learning volume dispatch failed', response.status, errText);
          }
          const log = await supabase
            .from('dispatch_log')
            .insert({
              student_id,
              unit_ids: null,
              minutes: null,
              requested_minutes: requestedMinutes,
              actual_minutes,
              channel: 'auto',
              status,
              study_plan_id: plan.id,
              platform_curriculum_id,
              platform_student_curriculum_id,
              platform_bundle_ref,
              question_type,
              ...(next_lesson_id ? { requested_lesson_id: next_lesson_id } : {}),
              ...(selected.lastLessonId ? { lesson_id: selected.lastLessonId } : {}),
              ...(response.ok ? { sent_at: new Date().toISOString() } : {}),
            })
            .select('id')
            .single();
          dispatchLogId = log.data?.id;
          if (response.ok) {
            await syncStudentCurriculums(student_id, platformStudentId);
          }
          try {
            const fp = platform_curriculum_id && platform_student_curriculum_id
              ? createHash('sha256')
                  .update(`${student_id}|${platform_curriculum_id}|${platform_student_curriculum_id}`)
                  .digest('hex')
              : null;
            await supabase
              .from('mas_actions')
              .insert({
                decision_id: decision_id ?? null,
                action_type: 'dispatch_minutes',
                request: {
                  student_id,
                  platform_student_id: platformStudentId,
                  platform_curriculum_id,
                  minutes: requestedMinutes,
                },
                status,
                response: { platform_bundle_ref, actual_minutes },
                platform_curriculum_id,
                platform_student_curriculum_id,
                platform_bundle_ref,
                requested_minutes: requestedMinutes,
                actual_minutes,
                dispatch_log_id: dispatchLogId ?? null,
                ...(fp ? { fingerprint: fp } : {}),
              });
          } catch {
            /* ignore */
          }
        }
      }
    }

    if (!dispatchLogId) {
      // Fallback: send concrete units via legacy units endpoint
      const response = await fetch(`${SUPERFASTSAT_API_URL}/units`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ units: selected.units }),
      });
      status = response.ok ? 'sent' : 'failed';
      const log = await supabase
        .from('dispatch_log')
        .insert({
          student_id,
          unit_ids: selected.units.map((u: any) => u.id),
          minutes: selected.total,
          requested_minutes: requestedMinutes || selected.total,
          channel: 'auto',
          status,
          study_plan_id: plan.id,
          platform_curriculum_id,
          platform_student_curriculum_id,
          question_type,
          ...(next_lesson_id ? { requested_lesson_id: next_lesson_id } : {}),
          ...(selected.lastLessonId ? { lesson_id: selected.lastLessonId } : {}),
          ...(response.ok ? { sent_at: new Date().toISOString() } : {}),
        })
        .select('id')
        .single();
      dispatchLogId = log.data?.id;
      // Log MAS action execution
      try {
        await supabase
          .from('mas_actions')
          .insert({
            decision_id: decision_id ?? null,
            action_type: 'dispatch_units',
            request: { student_id, platform_student_id: platformStudentId, units_count: selected.units.length },
            status,
            response: {},
            platform_curriculum_id,
            platform_student_curriculum_id,
            platform_bundle_ref: null,
            requested_minutes: requestedMinutes || selected.total,
            actual_minutes: selected.total,
            dispatch_log_id: dispatchLogId ?? null,
          });
      } catch {
        /* ignore */
      }
      if (!response.ok) {
        throw new Error(`SuperfastSAT API responded ${response.status}`);
      }
    }

    await supabase
      .from('students')
      .update({
        last_lesson_sent: new Date().toISOString(),
        ...(selected.lastLessonId ? { last_lesson_id: selected.lastLessonId } : {}),
      })
      .eq('id', student_id);

    res.status(200).json({ log_id: dispatchLogId });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'dispatch failed' });
  }
}
