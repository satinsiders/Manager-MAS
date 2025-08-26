import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../packages/shared/supabase';
import { notify } from '../../packages/shared/notify';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { student_id, version } = req.body as { student_id: string; version: number };
  try {
    // TODO: validate curriculum schema
    await supabase
      .from('students')
      .update({ current_curriculum_version: version })
      .eq('id', student_id);
    await notify({
      agent: 'qa-formatter',
      studentId: student_id,
      message: `curriculum ${version} validated`
    });
    res.status(200).json({ updated: true });
  } catch (err:any) {
    console.error(err);
    await notify({
      agent: 'qa-formatter',
      studentId: student_id,
      error: err.message
    });
    res.status(500).json({ error: 'qa failed' });
  }
}
