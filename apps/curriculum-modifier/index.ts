import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import { supabase } from '../../packages/shared/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // 1. Load performance summary from Supabase storage
    const { data: file } = await supabase.storage
      .from('summaries')
      .download('performance_summary.json');
    const summaryText = file ? await file.text() : '{}';
    const summary = JSON.parse(summaryText);

    // derive student id from summary or performances
    const student_id =
      summary.student_id || summary.performances?.[0]?.student_id || 'demo';

    // 2. Retrieve candidate lessons from Supabase
    const { data: lessons } = await supabase
      .from('lessons')
      .select('id, topic, difficulty')
      .limit(10);

    // 3. Ask OpenAI to propose a new lesson sequence
    const prompt = `Given the performance summary and candidate lessons, ` +
      `propose a new lesson sequence for the student and return JSON with "lesson_ids" ` +
      `and "notes".\nPerformance Summary:\n${summaryText}\nCandidate Lessons:\n${JSON.stringify(lessons)}`;

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }]
    });
    const llmResponse = completion.choices[0]?.message?.content || '{}';

    let proposal: any = {};
    try {
      proposal = JSON.parse(llmResponse);
    } catch {
      proposal = { lesson_ids: [], notes: 'LLM response parsing failed' };
    }

    // 4. Determine next curriculum version for the student
    const { data: last } = await supabase
      .from('curricula')
      .select('version')
      .eq('student_id', student_id)
      .order('version', { ascending: false })
      .limit(1);
    const newVersion = last && last.length > 0 ? last[0].version + 1 : 1;

    await supabase.from('curricula').insert({
      version: newVersion,
      student_id,
      lesson_ids: proposal.lesson_ids || [],
      notes: proposal.notes || ''
    });

    // 5. Store prompt and response for audit trail
    const auditContent = Buffer.from(
      JSON.stringify({ prompt, response: llmResponse }, null, 2)
    );
    await supabase.storage
      .from('summaries')
      .upload(
        `curriculum_audit/${student_id}_${newVersion}.json`,
        auditContent,
        { upsert: true, contentType: 'application/json' }
      );

    res.status(200).json({ version: newVersion });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'curriculum update failed' });
  }
}
