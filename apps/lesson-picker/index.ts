import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';
import {
  UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN,
} from '../../packages/shared/config';

const redis = new Redis({
  url: UPSTASH_REDIS_REST_URL,
  token: UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { student_id } = req.body as { student_id: string };
  try {
    const recentScores = await redis.lrange(`last_3_scores:${student_id}`, 0, 2);

    const avgScore =
      recentScores.length > 0
        ? recentScores.map(Number).reduce((a, b) => a + b, 0) / recentScores.length
        : 0;

    // Simple rule: struggling students get more practice time
    const minutes = avgScore < 60 ? 30 : 15;

    res.status(200).json({ minutes });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'minute selection failed' });
  }
}

