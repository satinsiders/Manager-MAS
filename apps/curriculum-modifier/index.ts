import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import { supabase } from '../../packages/shared/supabase';
import { OPENAI_API_KEY } from '../../packages/shared/config';
import { LATEST_SUMMARY_PATH } from '../../packages/shared/summary';

export async function fetchLatestSummary() {
  const { data: file } = await supabase.storage
    .from('summaries')
    .download(LATEST_SUMMARY_PATH);
  const rawText = file ? await file.text() : '{}';
  let parsed: any = {};
  try {
    parsed = JSON.parse(rawText);
  } catch {
    parsed = {};
  }
  const students: any[] = Array.isArray(parsed.students) ? parsed.students : [];
  return students.map((s) => ({ summary: s, summaryText: JSON.stringify(s) }));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // 1. Load performance summaries from Supabase storage
    const summaries = await fetchLatestSummary();

    // 2. Retrieve candidate lessons from Supabase
    const { data: lessons } = await supabase
      .from('lessons')
      .select('id, topic, difficulty')
      .limit(10);
    const lessonsText = JSON.stringify(lessons);

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const versions: { student_id: string; version: number }[] = [];

    for (const { summary, summaryText } of summaries) {
      const student_id = summary.student_id || 'demo';

      // 3. Ask OpenAI to propose a new curriculum structure
      const prompt =
        `Given the performance summary and candidate lessons, propose a new curriculum ` +
        `for the student and return JSON with \"lessons\" (each with units containing id and duration_minutes) ` +
        `and \"notes\".\nPerformance Summary:\n${summaryText}\nCandidate Lessons:\n${lessonsText}`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }]
      });
      const llmResponse = completion.choices[0]?.message?.content || '{}';

      let proposal: any = {};
      try {
        proposal = JSON.parse(llmResponse);
      } catch {
        proposal = { lessons: [], notes: 'LLM response parsing failed' };
      }

      // 4. Determine next curriculum version for the student
      const { data: last } = await supabase
        .from('curricula')
        .select('version')
        .eq('student_id', student_id)
        .order('version', { ascending: false })
        .limit(1);
      const newVersion = last && last.length > 0 ? last[0].version + 1 : 1;

      const curriculum = {
        version: newVersion,
        student_id,
        notes: proposal.notes || '',
        lessons: proposal.lessons || []
      };

      await supabase.from('curricula').insert({
        version: newVersion,
        student_id,
        curriculum
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

      versions.push({ student_id, version: newVersion });
    }

    res.status(200).json({ versions });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'curriculum update failed' });
  }
}
