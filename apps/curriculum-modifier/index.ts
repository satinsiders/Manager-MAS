import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../packages/shared/supabase';
import { notify } from '../../packages/shared/notify';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  let studentId: string | undefined;
  try {
    const { data: file } = await supabase.storage
      .from('summaries')
      .download('performance_summary.json');

    const summaryText = file ? await file.text() : '{}';
    const summary = JSON.parse(summaryText);

    // TODO: generate new curriculum
    const newVersion = Date.now();
    const { student_id = 'demo' } = summary;
    studentId = student_id;
    await supabase.from('curricula').insert({
      version: newVersion,
      student_id,
      lesson_ids: [],
      notes: 'auto-generated'
    });

    await notify({ agent: 'curriculum-modifier', studentId });
    res.status(200).json({ version: newVersion });
  } catch (err:any) {
    console.error(err);
    await notify({ agent: 'curriculum-modifier', studentId, error: err.message });
    res.status(500).json({ error: 'curriculum update failed' });
  }
}
