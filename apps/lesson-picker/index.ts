import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import OpenAI from 'openai';
import {
  OPENAI_API_KEY,
  UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN,
  AGENT_SECRET,
} from '../../packages/shared/config';
import { supabase } from '../../packages/shared/supabase';

// Default clients – injectable for tests
const redis = new Redis({
  url: UPSTASH_REDIS_REST_URL,
  token: UPSTASH_REDIS_REST_TOKEN,
});
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const VECTOR_DIM = 1536;
const MATCH_THRESHOLD = 0.75;
const MATCH_COUNT = 5;

export async function selectNextLesson(
  student_id: string,
  curriculum_version?: number,
  clients = { redis, supabase, openai },
) {
  const { redis: r, supabase: s, openai: o } = clients;

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
  const authHeader = req.headers['authorization'];
  const expected = `Bearer ${AGENT_SECRET}`;
  if (!authHeader || authHeader !== expected) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
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

