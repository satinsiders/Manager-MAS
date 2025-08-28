import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../packages/shared/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { log_id } = req.body as { log_id: string };
  try {
    const { data: log } = await supabase
      .from('dispatch_log')
      .select('*')
      .eq('id', log_id)
      .single();

    if (log) {
      const { data: lesson } = await supabase
        .from('lessons')
        .select('*')
        .eq('id', log.lesson_id)
        .single();

      if (lesson) {
        const response = await fetch(
          `${process.env.SUPERFASTSAT_API_URL}/lessons`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lesson })
          }
        );

        if (response.ok) {
          await supabase
            .from('dispatch_log')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', log_id);
          res.status(200).json({ status: 'dispatched' });
          return;
        } else {
          await supabase
            .from('dispatch_log')
            .update({ status: 'failed' })
            .eq('id', log_id);
          throw new Error(`SuperfastSAT API responded ${response.status}`);
        }
      }
    }

    await supabase
      .from('dispatch_log')
      .update({ status: 'failed' })
      .eq('id', log_id);
    throw new Error('dispatch data missing');
  } catch (err:any) {
    console.error(err);
    await supabase
      .from('dispatch_log')
      .update({ status: 'failed' })
      .eq('id', log_id);
    res.status(500).json({ error: 'dispatch failed' });
  }
}
