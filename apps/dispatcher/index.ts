import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../packages/shared/supabase';
import { notify } from '../../packages/shared/notify';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { log_id } = req.body as { log_id: string };
  let studentId: string | undefined;
  try {
    const { data: log } = await supabase
      .from('dispatch_log')
      .select('*')
      .eq('id', log_id)
      .single();

    if (log) {
      studentId = log.student_id;
      // TODO: send lesson to platform (Twilio/SendGrid)
      await supabase
        .from('dispatch_log')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', log_id);
    }

    await notify({ agent: 'dispatcher', studentId });
    res.status(200).json({ status: 'dispatched' });
  } catch (err:any) {
    console.error(err);
    await notify({ agent: 'dispatcher', studentId, error: err.message });
    res.status(500).json({ error: 'dispatch failed' });
  }
}
