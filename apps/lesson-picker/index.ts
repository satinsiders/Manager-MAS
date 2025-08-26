import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../packages/shared/supabase';
import { Redis } from '@upstash/redis';
import OpenAI from 'openai';
import {
  OPENAI_API_KEY,
  UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN,
} from '../../packages/shared/config';

const redis = new Redis({
  url: UPSTASH_REDIS_REST_URL,
  token: UPSTASH_REDIS_REST_TOKEN,
});
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

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

    const topics: string[] = Array.isArray((student as any)?.preferred_topics)
      ? (student as any).preferred_topics
      : [];
    const queryText = `Preferred topics: ${topics.join(', ')}. Recent scores: ${recentScores.join(', ')}`;
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: queryText
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;

    const { data: matches } = await supabase.rpc('match_lessons', {
      query_embedding: queryEmbedding,
      match_threshold: 0.75,
      match_count: 5
    });

    const { data: previous } = await supabase
      .from('dispatch_log')
      .select('lesson_id')
      .eq('student_id', student_id);
    const dispatchedIds = previous?.map((d: any) => d.lesson_id) ?? [];

    const avgScore =
      recentScores.length > 0
        ? recentScores.map(Number).reduce((a, b) => a + b, 0) / recentScores.length
        : 0;
    const maxDifficulty = Math.max(1, Math.round(avgScore / 20));

    const lesson = matches?.find(
      (m: any) => m.difficulty <= maxDifficulty && !dispatchedIds.includes(m.id)
    );

    let assignmentId: string | undefined;
    if (lesson && avgScore < 60) {
      const { data: assignment } = await supabase
        .from('assignments')
        .insert({
          lesson_id: lesson.id,
          student_id,
          questions_json: {},
          generated_by: 'lesson-picker'
        })
        .select('id')
        .single();
      assignmentId = assignment?.id;
    }

    let logId: string | undefined;
    if (lesson) {
      const { data: log } = await supabase
        .from('dispatch_log')
        .insert({
          student_id,
          lesson_id: lesson.id,
          channel: 'auto',
          status: 'pending'
        })
        .select('id')
        .single();
      logId = log?.id;
    }

    res
      .status(200)
      .json({ lesson_id: lesson?.id, assignment_id: assignmentId, log_id: logId });
  } catch (err:any) {
    console.error(err);
    res.status(500).json({ error: 'lesson selection failed' });
  }
}
