import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../packages/shared/supabase';
import { createHash } from 'crypto';
import { SUPERFASTSAT_API_URL } from '../../packages/shared/config';

export async function selectUnits(curriculum: any, minutes: number) {
  const flat: { unit: any; lessonId: string; duration: number }[] = [];
  for (const lesson of curriculum.lessons ?? []) {
    for (const unit of lesson.units ?? []) {
      flat.push({
        unit,
        lessonId: lesson.id,
        duration: Number(unit.duration_minutes) || 0,
      });
    }
  }

  const sums = new Map<number, number[]>();
  sums.set(0, []);
  flat.forEach((item, idx) => {
    const entries = Array.from(sums.entries());
    for (const [sum, indices] of entries) {
      const newSum = sum + item.duration;
      if (!sums.has(newSum)) {
        sums.set(newSum, [...indices, idx]);
      }
    }
  });

  let chosen = minutes;
  if (!sums.has(minutes)) {
    let bestUnder = -1;
    let bestOver = Infinity;
    for (const sum of sums.keys()) {
      if (sum === 0) continue;
      if (sum <= minutes && sum > bestUnder) {
        bestUnder = sum;
      } else if (sum > minutes && sum < bestOver) {
        bestOver = sum;
      }
    }
    if (bestUnder >= 0) {
      chosen = bestUnder;
    } else if (bestOver < Infinity) {
      chosen = bestOver;
    } else {
      chosen = 0;
    }
  }

  const indices = sums.get(chosen) ?? [];
  indices.sort((a, b) => a - b);
  const units = indices.map((i) => flat[i].unit);
  const lastLessonId = indices.length
    ? flat[indices[indices.length - 1]].lessonId
    : undefined;
  return { units, total: chosen, lastLessonId };
}

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
      .select('current_curriculum_version')
      .eq('id', student_id)
      .single();

    if (!student) throw new Error('student not found');

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
      selected = await selectUnits(plan.study_plan, minutes);
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

    // Resolve a platform curriculum for this question type via catalog mapping
    async function resolvePlatformCurriculumId(qtype?: string): Promise<string | null> {
      if (!qtype) return null;
      // Find a matching question_types row
      const { data: qt } = await supabase
        .from('question_types')
        .select('id, specific_type, canonical_path')
        .ilike('specific_type', qtype)
        .limit(1);
      let qid: string | undefined = qt && qt.length > 0 ? (qt[0] as any).id : undefined;
      if (!qid) {
        // Try another lookup via canonical_path suffix
        const { data: qt2 } = await supabase
          .from('question_types')
          .select('id, canonical_path')
          .ilike('canonical_path', `%> ${qtype}`)
          .limit(1);
        qid = qt2 && qt2.length > 0 ? (qt2[0] as any).id : undefined;
      }
      if (!qid) return null;
      const { data: cat } = await supabase
        .from('curriculum_catalog')
        .select('external_curriculum_id, active')
        .eq('question_type_id', qid)
        .eq('active', true)
        .limit(1);
      const entry = cat && cat.length > 0 ? (cat[0] as any) : null;
      return entry?.external_curriculum_id ?? null;
    }

    let status = 'failed';
    let dispatchLogId: string | undefined;
    let platform_curriculum_id: string | null = null;
    let platform_bundle_ref: string | null = null;
    let actual_minutes: number | null = null;

    if (!presetUnits && requestedMinutes > 0) {
      // Try minutes-based dispatch via platform curriculum mapping
      platform_curriculum_id = await resolvePlatformCurriculumId(question_type);
      if (platform_curriculum_id) {
        // Clamp request to remaining workload if mirror data exists
        try {
          const { data: mirror } = await supabase
            .from('platform_dispatches')
            .select('remaining_minutes')
            .eq('student_id', student_id)
            .eq('external_curriculum_id', platform_curriculum_id)
            .single();
            if (mirror && typeof mirror.remaining_minutes === 'number') {
              if (mirror.remaining_minutes <= 0) {
                // no minutes left; attempt to assign a new curriculum for this type
                platform_curriculum_id = null;
                // find candidate external curriculum id in catalog
                let qid: string | undefined;
                if (question_type) {
                  const { data: qt } = await supabase
                    .from('question_types')
                    .select('id, specific_type, canonical_path')
                    .ilike('specific_type', question_type)
                    .limit(1);
                  qid = qt && qt.length > 0 ? (qt[0] as any).id : undefined;
                  if (!qid) {
                    const { data: qt2 } = await supabase
                      .from('question_types')
                      .select('id, canonical_path')
                      .ilike('canonical_path', `%> ${question_type}`)
                      .limit(1);
                    qid = qt2 && qt2.length > 0 ? (qt2[0] as any).id : undefined;
                  }
                }
                if (qid) {
                  const { data: catalog } = await supabase
                    .from('curriculum_catalog')
                    .select('external_curriculum_id')
                    .eq('question_type_id', qid)
                    .eq('active', true);
                  const extIds: string[] = (catalog ?? []).map((c: any) => c.external_curriculum_id);
                  const { data: existing } = await supabase
                    .from('platform_dispatches')
                    .select('external_curriculum_id')
                    .eq('student_id', student_id);
                  const existingSet = new Set((existing ?? []).map((e: any) => e.external_curriculum_id));
                  const candidate = extIds.find((id) => !existingSet.has(id)) ?? extIds[0];
                  if (candidate) {
                    try {
                      const assignResp = await fetch(`${SUPERFASTSAT_API_URL}/assign`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          student_id,
                          external_curriculum_id: candidate,
                        }),
                      });
                      if (assignResp.ok) {
                        platform_curriculum_id = candidate;
                        // Log assignment action
                        try {
                          await supabase
                            .from('mas_actions')
                            .insert({
                              decision_id: decision_id ?? null,
                              action_type: 'assign_curriculum',
                              request: { student_id, external_curriculum_id: candidate },
                              status: 'sent',
                              response: {},
                              platform_curriculum_id: candidate,
                            });
                        } catch {
                          /* ignore */
                        }
                      }
                    } catch {
                      /* ignore assignment errors */
                    }
                  }
                }
              } else if (mirror.remaining_minutes < requestedMinutes) {
                requestedMinutes = mirror.remaining_minutes;
              }
            }
          } catch {
            /* ignore mirror errors */
        }
      }
      if (platform_curriculum_id) {
        const response = await fetch(`${SUPERFASTSAT_API_URL}/dispatch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student_id,
            external_curriculum_id: platform_curriculum_id,
            minutes: requestedMinutes,
          }),
        });
        status = response.ok ? 'sent' : 'failed';
        try {
          const body = await response.json().catch(() => ({}));
          platform_bundle_ref = body?.bundle_ref ?? null;
          actual_minutes = typeof body?.actual_minutes === 'number' ? body.actual_minutes : null;
        } catch {
          /* ignore */
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
            platform_bundle_ref,
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
          const fp = platform_curriculum_id && platform_bundle_ref
            ? createHash('sha256').update(`${student_id}|${platform_curriculum_id}|${platform_bundle_ref}`).digest('hex')
            : null;
          await supabase
            .from('mas_actions')
            .insert({
              decision_id: decision_id ?? null,
              action_type: 'dispatch_minutes',
              request: { student_id, external_curriculum_id: platform_curriculum_id, minutes: requestedMinutes },
              status,
              response: { platform_bundle_ref, actual_minutes },
              platform_curriculum_id,
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
            request: { student_id, units_count: selected.units.length },
            status,
            response: {},
            platform_curriculum_id,
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
