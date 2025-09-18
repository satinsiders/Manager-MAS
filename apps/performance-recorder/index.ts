import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../packages/shared/supabase';

export const LAST_SCORES_TTL = parseInt(
  process.env.LAST_SCORES_TTL ?? '604800',
  10
);

export async function updateLastScores(
  studentId: string,
  score: number
) {
  const { data } = await supabase
    .from('student_recent_scores')
    .select('scores, updated_at')
    .eq('student_id', studentId)
    .maybeSingle();

  const existingScores = Array.isArray(data?.scores)
    ? (data?.scores as number[])
    : [];
  const nextScores = [Number(score), ...existingScores]
    .filter((value) => Number.isFinite(value))
    .slice(0, 3);

  const now = new Date().toISOString();

  await supabase
    .from('student_recent_scores')
    .upsert({
      student_id: studentId,
      scores: nextScores,
      updated_at: now,
    });
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  const {
    student_id,
    lesson_id,
    score,
    confidence_rating,
    study_plan_id,
    curriculum_id,
    platform_curriculum_id,
    question_type,
  } = req.body as {
    student_id: string;
    lesson_id: string;
    score: number;
    confidence_rating?: number;
    study_plan_id?: string;
    curriculum_id?: string; // deprecated; fallback support
    platform_curriculum_id?: string;
    question_type?: string;
  };
  try {
    const { data } = await supabase
      .from('performances')
      .insert({
        student_id,
        lesson_id,
        score,
        confidence_rating: confidence_rating ?? null,
        study_plan_id: study_plan_id ?? curriculum_id ?? null,
        platform_curriculum_id: platform_curriculum_id ?? null,
        question_type: question_type ?? null,
      })
      .select()
      .single();

    await updateLastScores(student_id, score);

    res.status(200).json({ id: data?.id });
  } catch (err:any) {
    console.error(err);
    res.status(500).json({ error: 'record failed' });
  }
}
