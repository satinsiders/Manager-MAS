import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../packages/shared/supabase';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { student_id } = req.body as { student_id: string };
  try {
    const { data: student } = await supabase
      .from('students')
      .select('*')
      .eq('id', student_id)
      .single();

    const recentScores = await redis.lrange(`last_3_scores:${student_id}`, 0, 2);

    console.log('Lesson picker', { student, recentScores });

    // TODO: vector similarity search on lessons table
    const { data: lesson } = await supabase
      .from('lessons')
      .select('id')
      .limit(1)
      .single();

    if (lesson && student) {
      await supabase.from('dispatch_log').insert({
        student_id,
        lesson_id: lesson.id,
        channel: 'auto',
        status: 'pending'
      });
    }

    res.status(200).json({ lesson_id: lesson?.id });
  } catch (err:any) {
    console.error(err);
    res.status(500).json({ error: 'lesson selection failed' });
  }
}
