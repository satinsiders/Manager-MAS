import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../packages/shared/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Incoming requests must provide the dispatch log's ID.
  const { log_id } = req.body as { log_id: string };
  try {
    const { data: log } = await supabase
      .from('dispatch_log')
      .select('*')
      .eq('id', log_id) // Lookup solely by the provided log_id
      .single();

    if (log) {
      // TODO: send lesson to platform (Twilio/SendGrid)
      await supabase
        .from('dispatch_log')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', log_id);
    }

    res.status(200).json({ status: 'dispatched' });
  } catch (err:any) {
    console.error(err);
    res.status(500).json({ error: 'dispatch failed' });
  }
}
