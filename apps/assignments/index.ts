import type { VercelRequest, VercelResponse } from '../../packages/shared/vercel';
import { randomUUID } from 'crypto';
import { supabase } from '../../packages/shared/supabase';

type UnitInput = {
  id?: string;
  unit_id?: string;
  lesson_id?: string;
  lessonId?: string;
  duration_minutes?: number;
};

function normalizeUnits(units: UnitInput[] = []) {
  return units.map((unit) => {
    const duration = Number(unit.duration_minutes ?? 0) || 0;
    return {
      unit_id: unit.id ?? unit.unit_id ?? null,
      lesson_id: unit.lesson_id ?? unit.lessonId ?? null,
      duration_minutes: duration,
    };
  });
}

function inferDuration(requested: number | null, units: ReturnType<typeof normalizeUnits>) {
  if (requested && requested > 0) return requested;
  const total = units.reduce((sum, unit) => sum + (unit.duration_minutes ?? 0), 0);
  return total > 0 ? total : 15;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const {
    student_id,
    study_plan_version,
    units,
    minutes,
    decision_id,
    next_curriculum_id,
  } = (req.body || {}) as {
    student_id?: string;
    study_plan_version?: number | null;
    units?: UnitInput[];
    minutes?: number | null;
    decision_id?: string | null;
    next_curriculum_id?: string | null;
  };

  if (!student_id) {
    res.status(400).json({ error: 'student_id required' });
    return;
  }

  try {
    const normalizedUnits = normalizeUnits(units);
    const duration = inferDuration(minutes ?? null, normalizedUnits);

    const payload = {
      id: randomUUID(),
      student_id,
      study_plan_version_id: study_plan_version ?? null,
      platform_curriculum_id: null,
      lesson_id: next_curriculum_id ?? null,
      duration_minutes: duration,
      questions_json: normalizedUnits,
      generated_by: 'assignments-agent',
      status: 'pending',
    };

    const { data: inserted, error } = await supabase
      .from('assignments')
      .insert(payload)
      .select('id')
      .single();

    if (error) throw error;

    res.status(200).json({
      assignment_id: inserted?.id ?? payload.id,
      units,
      minutes: duration,
      decision_id: decision_id ?? null,
      next_curriculum_id: next_curriculum_id ?? null,
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'assignment generation failed' });
  }
}
