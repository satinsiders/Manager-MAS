import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../packages/shared/supabase';
import { SUPERFASTSAT_API_URL } from '../../packages/shared/config';

async function selectUnits(curriculum: any, minutes: number) {
  const units: any[] = [];
  let total = 0;
  let lastLessonId: string | undefined;
  for (const lesson of curriculum.lessons ?? []) {
    for (const unit of lesson.units ?? []) {
      if (total >= minutes) break;
      units.push(unit);
      total += Number(unit.duration_minutes) || 0;
      lastLessonId = lesson.id;
    }
    if (total >= minutes) break;
  }
  return { units, total, lastLessonId };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { student_id, minutes = 0, units: presetUnits } = req.body as {
    student_id: string;
    minutes?: number;
    units?: any[];
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

