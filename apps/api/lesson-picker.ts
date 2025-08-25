import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../packages/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { data, error } = await supabase
    .from('lessons')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch lessons' });
  }

  res.status(200).json({ lesson: data?.[0] });
}
