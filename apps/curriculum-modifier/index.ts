import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../packages/shared/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { data: file } = await supabase.storage
      .from('summaries')
      .download('performance_summary.json');

    const summaryText = file ? await file.text() : '{}';
    const summary = JSON.parse(summaryText);

    // TODO: generate new curriculum
    const newVersion = Date.now();
    const { student_id = 'demo' } = summary;
    await supabase.from('curricula').insert({
      version: newVersion,
      student_id,
      lesson_ids: [],
      notes: 'auto-generated'
    });

    res.status(200).json({ version: newVersion });
  } catch (err:any) {
    console.error(err);
    res.status(500).json({ error: 'curriculum update failed' });
  }
}
