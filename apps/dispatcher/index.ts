import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../packages/shared/supabase';
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
  const { student_id, minutes = 0, units: presetUnits, next_lesson_id } =
    req.body as {
      student_id: string;
      minutes?: number;
      units?: any[];
      next_lesson_id?: string;
    };

  try {
    let selected: { units: any[]; total: number; lastLessonId?: string } = {
      units: presetUnits ?? [],
      total: 0,
      lastLessonId: undefined,
    };

    if (!presetUnits) {
      const { data: student } = await supabase
        .from('students')
        .select('current_curriculum_version')
        .eq('id', student_id)
        .single();

      if (!student) throw new Error('student not found');

      const { data: curr } = await supabase
        .from('curricula')
        .select('curriculum')
        .eq('student_id', student_id)
        .eq('version', student.current_curriculum_version)
        .single();

      if (!curr) throw new Error('curriculum not found');

      selected = await selectUnits(curr.curriculum, minutes);
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

    const response = await fetch(`${SUPERFASTSAT_API_URL}/units`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ units: selected.units }),
    });

    const status = response.ok ? 'sent' : 'failed';
    const log = await supabase
      .from('dispatch_log')
      .insert({
        student_id,
        unit_ids: selected.units.map((u: any) => u.id),
        minutes: selected.total,
        channel: 'auto',
        status,
        ...(next_lesson_id
          ? { requested_lesson_id: next_lesson_id }
          : {}),
        ...(selected.lastLessonId ? { lesson_id: selected.lastLessonId } : {}),
        ...(response.ok ? { sent_at: new Date().toISOString() } : {}),
      })
      .select('id')
      .single();

    await supabase
      .from('students')
      .update({
        last_lesson_sent: new Date().toISOString(),
        ...(selected.lastLessonId ? { last_lesson_id: selected.lastLessonId } : {}),
      })
      .eq('id', student_id);

    if (!response.ok) {
      throw new Error(`SuperfastSAT API responded ${response.status}`);
    }

    res.status(200).json({ log_id: log.data?.id });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'dispatch failed' });
  }
}

