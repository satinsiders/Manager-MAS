import type { VercelRequest, VercelResponse } from '../../packages/shared/vercel';
import { supabase } from '../../packages/shared/supabase';
import {
  loadQuestionTypeLookup,
  normalizeQuestionTypeReference,
  QuestionTypeLookup,
} from '../../packages/shared/questionTypes';

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

const QUESTION_TYPE_CACHE_MS = 5 * 60 * 1000;
let questionTypeLookupCache: { lookup: QuestionTypeLookup; loadedAt: number } | null = null;

async function getQuestionTypeLookup(): Promise<QuestionTypeLookup> {
  const now = Date.now();
  if (questionTypeLookupCache && now - questionTypeLookupCache.loadedAt < QUESTION_TYPE_CACHE_MS) {
    return questionTypeLookupCache.lookup;
  }
  const lookup = await loadQuestionTypeLookup();
  questionTypeLookupCache = { lookup, loadedAt: now };
  return lookup;
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
    question_type_id,
    skill_code,
    canonical_path,
  } = req.body as {
    student_id: string;
    lesson_id: string;
    score: number;
    confidence_rating?: number;
    study_plan_id?: string;
    curriculum_id?: string; // deprecated; fallback support
    platform_curriculum_id?: string;
    question_type?: string;
    question_type_id?: string;
    skill_code?: string;
    canonical_path?: string;
  };
  try {
    const lookup = await getQuestionTypeLookup();
    const normalized = normalizeQuestionTypeReference(lookup, {
      question_type,
      question_type_id,
      canonical_path,
      skill_code,
    });

    const { data } = await supabase
      .from('performances')
      .insert({
        student_id,
        lesson_id,
        score,
        confidence_rating: confidence_rating ?? null,
        study_plan_id: study_plan_id ?? curriculum_id ?? null,
        platform_curriculum_id: platform_curriculum_id ?? null,
        question_type: normalized.question_type ?? question_type ?? null,
        question_type_id: normalized.question_type_id ?? question_type_id ?? null,
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
