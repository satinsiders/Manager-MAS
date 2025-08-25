import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../packages/shared/supabase';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { student_id, lesson_id, score } = req.body as {
    student_id: string;
    lesson_id: string;
    score: number;
  };
  try {
    const { data } = await supabase
      .from('performances')
      .insert({ student_id, lesson_id, score })
      .select()
      .single();

    await redis.lpush(`last_3_scores:${student_id}`, score);
    await redis.ltrim(`last_3_scores:${student_id}`, 0, 2);

    res.status(200).json({ id: data?.id });
  } catch (err:any) {
    console.error(err);
    res.status(500).json({ error: 'record failed' });
  }
}
