import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../packages/shared/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { data: performances } = await supabase
      .from('performances')
      .select('*')
      .gte('timestamp', new Date(Date.now() - 7*24*60*60*1000).toISOString());

    const summary = { performances };
    const content = Buffer.from(JSON.stringify(summary, null, 2));

    await supabase.storage
      .from('summaries')
      .upload('performance_summary.json', content, {
        upsert: true,
        contentType: 'application/json'
      });

    res.status(200).json({ saved: true });
  } catch (err:any) {
    console.error(err);
    res.status(500).json({ error: 'aggregation failed' });
  }
}
