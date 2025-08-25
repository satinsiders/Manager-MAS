import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../packages/shared/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { student_id, version } = req.body as { student_id: string; version: number };
  try {
    // TODO: validate curriculum schema
    await supabase
      .from('students')
      .update({ current_curriculum_version: version })
      .eq('id', student_id);

    res.status(200).json({ updated: true });
  } catch (err:any) {
    console.error(err);
    res.status(500).json({ error: 'qa failed' });
  }
}
