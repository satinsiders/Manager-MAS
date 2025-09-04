import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import { supabase } from '../../packages/shared/supabase';
import { OPENAI_API_KEY } from '../../packages/shared/config';
import { LATEST_SUMMARY_PATH } from '../../packages/shared/summary';
import { notify } from '../../packages/shared/notify';

export async function fetchLatestSummary() {
  try {
    const { data: file, error } = await supabase.storage
      .from('summaries')
      .download(LATEST_SUMMARY_PATH);
    if (error || !file) return [];
    const rawText = await file.text();
    if (!rawText) return [];
    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      await notify('Failed to parse latest summary', 'studyplan-editor');
      return [];
    }
    const students: any[] = Array.isArray(parsed.students) ? parsed.students : [];
    return students.map((s) => ({ summary: s, summaryText: JSON.stringify(s) }));
  } catch {
    return [];
  }
}

export async function getNextStudyplanVersion(
  student_id: string,
  client = supabase
) {
  const { data: lastApproved } = await client
    .from('studyplans')
    .select('version')
    .eq('student_id', student_id)
    .order('version', { ascending: false })
    .limit(1);

  const { data: lastDraft } = await client
    .from('studyplan_drafts')
    .select('version')
    .eq('student_id', student_id)
    .order('version', { ascending: false })
    .limit(1);

  const maxVersion = Math.max(
    lastApproved && lastApproved.length > 0 ? lastApproved[0].version : 0,
    lastDraft && lastDraft.length > 0 ? lastDraft[0].version : 0
  );
  return maxVersion + 1;
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

      // 3. Ask OpenAI to propose a new studyplan structure
      const prompt =
        `Given the performance summary and candidate lessons, propose a new studyplan ` +
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

      // 4. Determine next studyplan version for the student
      const newVersion = await getNextStudyplanVersion(student_id);

      const studyplan = {
        version: newVersion,
        student_id,
        notes: proposal.notes || '',
        lessons: proposal.lessons || []
      };

      await supabase.from('studyplan_drafts').insert({
        version: newVersion,
        student_id,
        studyplan
      });

      // 5. Store prompt and response for audit trail
      const auditContent = Buffer.from(
        JSON.stringify({ prompt, response: llmResponse }, null, 2)
      );
      await supabase.storage
        .from('summaries')
        .upload(
          `studyplan_audit/${student_id}_${newVersion}.json`,
          auditContent,
          { upsert: true, contentType: 'application/json' }
        );

      versions.push({ student_id, version: newVersion });
    }

    res.status(200).json({ versions });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'studyplan update failed' });
  }
}
