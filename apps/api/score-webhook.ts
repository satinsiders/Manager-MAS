import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../packages/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { user_id, lesson_id, score } = payload || {};

  const { error } = await supabase.from('scores').insert({ user_id, lesson_id, score });
  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to record score' });
  }

  res.status(200).json({ received: true });
}
