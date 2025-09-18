import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import {
  OPENAI_API_KEY,
} from '../../packages/shared/config';
import { supabase } from '../../packages/shared/supabase';

// Default clients – injectable for tests
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const VECTOR_DIM = 1536;
const MATCH_THRESHOLD = 0.75;
const MATCH_COUNT = 5;
const RECENT_SCORES_TTL = parseInt(process.env.LAST_SCORES_TTL ?? '604800', 10);

type Lesson = { id: string; difficulty: number; topic?: string; [key: string]: any };
type RuleFilter = (lesson: Lesson) => boolean;

export async function selectNextLesson(
  student_id: string,
  curriculum_version?: number,
  clients = { supabase, openai },
  ruleFilters: RuleFilter[] = [],
) {
  const { supabase: s, openai: o } = clients;

  // Read last 3 scores from Supabase to gauge performance
  const { data: recent } = await s
    .from('student_recent_scores')
    .select('scores, updated_at')
    .eq('student_id', student_id)
    .maybeSingle();

  let usableScores: number[] = Array.isArray(recent?.scores)
    ? (recent?.scores as number[])
    : [];
  if (recent?.updated_at) {
    const updatedAt = new Date(recent.updated_at).getTime();
    if (Date.now() - updatedAt > RECENT_SCORES_TTL * 1000) {
      usableScores = [];
    }
  }

  const avgScore =
    usableScores.length > 0
      ? usableScores.reduce((sum, value) => sum + Number(value || 0), 0) /
        usableScores.length
      : 0;
  const minutes = avgScore < 60 ? 30 : 15;

  // Fetch student preferences and history
  const { data: student } = await s
    .from('students')
    .select('preferred_topics, last_lesson_id')
    .eq('id', student_id)
    .single();

  const topics = student?.preferred_topics ?? [];

  // Look up mastered question types
  const { data: progress } = await s
    .from('student_progress')
    .select('question_type')
    .eq('student_id', student_id)
    .eq('mastered', true);
  const masteredTypes = new Set(
    (progress ?? []).map((p: any) => p.question_type)
  );

  let embedding: number[] = Array(VECTOR_DIM).fill(0);
  try {
    const response = await o.embeddings.create({
      model: 'text-embedding-3-small',
      input: topics.join(' '),
    });
    const raw = response.data[0]?.embedding || [];
    if (raw.length !== VECTOR_DIM) {
      for (let i = 0; i < Math.min(VECTOR_DIM, raw.length); i++) {
        embedding[i] = raw[i];
      }
    } else {
      embedding = raw;
    }
  } catch (err) {
    console.error(err);
    throw new Error('embedding failed');
  }

  const { data: matches } = await s.rpc('match_lessons', {
    query_embedding: embedding,
    match_threshold: MATCH_THRESHOLD,
    match_count: MATCH_COUNT,
  });

  const candidates: Lesson[] = (matches ?? [])
    .filter((l: Lesson) => l.id !== student?.last_lesson_id)
    .filter(
      (l: Lesson) => topics.length === 0 || topics.includes(l.topic ?? ''),
    );

  const filtered =
    ruleFilters.length > 0
      ? candidates.filter((l) => ruleFilters.every((fn) => fn(l)))
      : candidates;

  // Difficulty rule: struggling students get easier lessons
  let next = filtered[0];
  if (filtered.length > 1) {
    next =
      avgScore < 60
        ? filtered.sort((a, b) => a.difficulty - b.difficulty)[0]
        : filtered.sort((a, b) => b.difficulty - a.difficulty)[0];
  }

  if (!next) throw new Error('no lesson match');

  // Attempt to gather units for the chosen lesson from curriculum
  // Derive question type from the lesson (curriculum title proxy)
  let chosenQuestionType: string | undefined;
  try {
    const { data: lessonRow } = await s
      .from('lessons')
      .select('topic')
      .eq('id', next.id)
      .single();
    chosenQuestionType = lessonRow?.topic ?? undefined;
  } catch {
    /* ignore */
  }

  // If the derived question type is already mastered, request new study plan/curriculum
  if (chosenQuestionType && masteredTypes.has(chosenQuestionType)) {
    return { action: 'request_new_curriculum' };
  }

  // Prefer minutes-based dispatch if a platform curriculum is available with remaining workload
  let preferMinutes = false;
  try {
    if (chosenQuestionType) {
      const { data: qt } = await s
        .from('question_types')
        .select('id, specific_type, canonical_path')
        .ilike('specific_type', chosenQuestionType)
        .limit(1);
      let qid: string | undefined = qt && qt.length > 0 ? (qt[0] as any).id : undefined;
      if (!qid) {
        const { data: qt2 } = await s
          .from('question_types')
          .select('id, canonical_path')
          .ilike('canonical_path', `%> ${chosenQuestionType}`)
          .limit(1);
        qid = qt2 && qt2.length > 0 ? (qt2[0] as any).id : undefined;
      }
      if (qid) {
        const { data: catalog } = await s
          .from('curriculum_catalog')
          .select('external_curriculum_id')
          .eq('question_type_id', qid)
          .eq('active', true);
        const extIds = new Set((catalog ?? []).map((c: any) => c.external_curriculum_id));
        if (extIds.size > 0) {
          const { data: mirror } = await s
            .from('platform_dispatches')
            .select('external_curriculum_id, remaining_minutes')
            .eq('student_id', student_id);
          const remainingOk = (mirror ?? []).some((m: any) =>
            extIds.has(m.external_curriculum_id) && (m.remaining_minutes == null || Number(m.remaining_minutes) > 0)
          );
          preferMinutes = remainingOk || (mirror ?? []).length === 0; // if no mirror data, we still allow minutes
        }
      }
    }
  } catch {
    // Ignore mapping errors and proceed with units
  }

  let units: any[] = [];
  if (curriculum_version !== undefined) {
    const { data: plan } = await s
      .from('study_plans')
      .select('study_plan')
      .eq('student_id', student_id)
      .eq('version', curriculum_version)
      .single();
    const lesson = plan?.study_plan?.lessons?.find(
      (l: any) => l.id === next.id
    );
    if (lesson?.units) {
      // Units inherit the question type from the parent lesson/curriculum; do not filter per-unit
      units = lesson.units as any[];
    }
  }

  // Fallback to assignments if no curriculum units found
  if (units.length === 0) {
    // If the lesson's question type is mastered, do not fall back to assignments
    if (chosenQuestionType && masteredTypes.has(chosenQuestionType)) {
      return { action: 'request_new_curriculum' };
    }
    const { data: assigns } = await s
      .from('assignments')
      .select('id, lesson_id, questions_json, duration_minutes')
      .eq('student_id', student_id)
      .eq('lesson_id', next.id);
    units =
      assigns
        ?.map((a: any) => ({
          id: a.id,
          lesson_id: a.lesson_id,
          duration_minutes: a.duration_minutes,
          questions: a.questions_json ?? [],
        })) ?? [];
  }

  if (preferMinutes) {
    // Return minutes-only path to allow dispatcher to select platform curriculum
    return { next_lesson_id: next.id, minutes };
  }

  if (units.length === 0) {
    return { action: 'request_new_curriculum' };
  }

  // Provisional log entry for dispatch tracking
  try {
    await s
      .from('dispatch_log')
      .insert({
        student_id,
        lesson_id: next.id,
        status: 'selected',
        sent_at: new Date().toISOString(),
      });
  } catch (err) {
    console.error('dispatch_log insert failed', err);
  }

  return { next_lesson_id: next.id, minutes, units };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { student_id, curriculum_version } = req.body as {
    student_id: string;
    curriculum_version?: number;
  };
  try {
    const result = await selectNextLesson(student_id, curriculum_version);
    res.status(200).json(result);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'lesson selection failed' });
  }
}
