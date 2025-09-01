import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import {
  UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN,
} from '../../packages/shared/config';
import { supabase } from '../../packages/shared/supabase';

// Default clients – injectable for tests
const redis = new Redis({
  url: UPSTASH_REDIS_REST_URL,
  token: UPSTASH_REDIS_REST_TOKEN,
});

const VECTOR_DIM = 1536;
const MATCH_THRESHOLD = 0.75;
const MATCH_COUNT = 5;

export async function selectNextLesson(
  student_id: string,
  curriculum_version?: number,
  clients = { redis, supabase },
) {
  const { redis: r, supabase: s } = clients;

  // Read last 3 scores from Redis to gauge performance
  const recentScores = await r.lrange(`last_3_scores:${student_id}`, 0, 2);
  const avgScore =
    recentScores.length > 0
      ? recentScores.map(Number).reduce((a, b) => a + b, 0) / recentScores.length
      : 0;
  const minutes = avgScore < 60 ? 30 : 15;

  // Fetch student preferences and history
  const { data: student } = await s
    .from('students')
    .select('preferred_topics, last_lesson_id')
    .eq('id', student_id)
    .single();

  const topics = student?.preferred_topics ?? [];

  // Very naive embedding: char codes normalised into a 1536 vector
  const embedding = Array(VECTOR_DIM).fill(0);
  const str = topics.join(' ');
  for (let i = 0; i < str.length && i < VECTOR_DIM; i++) {
    embedding[i] = str.charCodeAt(i) / 255;
  }

  const { data: matches } = await s.rpc('match_lessons', {
    query_embedding: embedding,
    match_threshold: MATCH_THRESHOLD,
    match_count: MATCH_COUNT,
  });

  const candidates = (matches ?? []).filter(
    (l: any) => l.id !== student?.last_lesson_id,
  );

  // Difficulty rule: struggling students get easier lessons
  let next = candidates[0];
  if (candidates.length > 1) {
    next =
      avgScore < 60
        ? candidates.sort((a: any, b: any) => a.difficulty - b.difficulty)[0]
        : candidates.sort((a: any, b: any) => b.difficulty - a.difficulty)[0];
  }

  if (!next) throw new Error('no lesson match');

  // Attempt to gather units for the chosen lesson from curriculum
  let units: any[] = [];
  if (curriculum_version !== undefined) {
    const { data: curr } = await s
      .from('curricula')
      .select('curriculum')
      .eq('student_id', student_id)
      .eq('version', curriculum_version)
      .single();
    const lesson = curr?.curriculum?.lessons?.find(
      (l: any) => l.id === next.id
    );
    if (lesson?.units) {
      units = lesson.units;
    }
  }

  // Fallback to assignments if no curriculum units found
  if (units.length === 0) {
    const { data: assigns } = await s
      .from('assignments')
      .select('id, lesson_id, questions_json')
      .eq('student_id', student_id)
      .eq('lesson_id', next.id);
    units =
      assigns?.map((a: any) => ({
        id: a.id,
        lesson_id: a.lesson_id,
        questions: a.questions_json,
      })) ?? [];
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

