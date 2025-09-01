import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import {
  UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN,
  AGENT_SECRET,
} from '../../packages/shared/config';

export const redis = new Redis({
  url: UPSTASH_REDIS_REST_URL,
  token: UPSTASH_REDIS_REST_TOKEN,
});

export const LAST_SCORES_TTL = parseInt(
  process.env.LAST_SCORES_TTL ?? '604800',
  10
);

export async function updateLastScores(
  studentId: string,
  score: number,
  client = redis
) {
  const key = `last_3_scores:${studentId}`;
  await client.lpush(key, score);
  await client.ltrim(key, 0, 2);
  await client.expire(key, LAST_SCORES_TTL);
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
  client = redis,
) {
  const authHeader = req.headers['authorization'];
  const expected = `Bearer ${AGENT_SECRET}`;
  if (!authHeader || authHeader !== expected) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const { student_id, lesson_id, score, confidence_rating } = req.body as {
    student_id: string;
    lesson_id: string;
    score: number;
    confidence_rating?: number;
  };
  try {
    const { supabase } = await import('../../packages/shared/supabase');
    const { data } = await supabase
      .from('performances')
      .insert({
        student_id,
        lesson_id,
        score,
        confidence_rating: confidence_rating ?? null,
      })
      .select()
      .single();

    await updateLastScores(student_id, score, client);

    res.status(200).json({ id: data?.id });
  } catch (err:any) {
    console.error(err);
    res.status(500).json({ error: 'record failed' });
  }
}
